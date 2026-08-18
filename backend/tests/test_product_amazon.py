from bs4 import BeautifulSoup

from app.services.product_service import (
    _ensure_min_images,
    _html_images,
    _html_title,
    is_amazon_product_url,
    parse_amazon_asin,
)


def test_parse_amazon_asin_from_dp_url():
    assert parse_amazon_asin("https://www.amazon.com/dp/B0CXYZ1234") == "B0CXYZ1234"
    assert parse_amazon_asin("https://www.amazon.com/Some-Title/dp/B08N5WRWNW/ref=sr_1_1") == "B08N5WRWNW"


def test_parse_amazon_asin_from_gp_product():
    assert parse_amazon_asin("https://www.amazon.co.jp/gp/product/B09ABCDEFG") == "B09ABCDEFG"


def test_parse_amazon_asin_from_query():
    assert parse_amazon_asin("https://www.amazon.com/s?k=foo&asin=B07XJ8C8F5") == "B07XJ8C8F5"


def test_parse_amazon_asin_rejects_non_product():
    assert parse_amazon_asin("https://www.amazon.com/gp/bestsellers") is None
    assert parse_amazon_asin("https://www.amazon.com/") is None
    assert not is_amazon_product_url("https://example.com/dp/B08N5WRWNW")


def test_is_amazon_product_url():
    assert is_amazon_product_url("https://www.amazon.com/dp/B08N5WRWNW")
    assert is_amazon_product_url("https://www.amazon.co.uk/dp/B08N5WRWNW")
    assert not is_amazon_product_url("https://blog.naver.com/foo/123")
    assert not is_amazon_product_url("https://www.amazon.com/")


def test_html_title_and_images_from_og():
    html = """
    <html><head>
      <meta property="og:title" content="Test Gadget Pro" />
      <meta property="og:image" content="https://m.media-amazon.com/images/I/abc123._SL500_.jpg" />
    </head>
    <body>
      <span id="productTitle">Test Gadget Pro</span>
      <img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/def456._AC_SL1500_.jpg" />
    </body></html>
    """
    soup = BeautifulSoup(html, "html.parser")
    assert _html_title(soup) == "Test Gadget Pro"
    images = _html_images(soup, "B08N5WRWNW", html=html)
    assert any("abc123" in url or "def456" in url for url in images)
    assert len(images) >= 1


def test_html_images_dedupes_size_variants_and_keeps_gallery():
    html = """
    <html><body>
    <script>
    var data = {
      "colorImages": {"initial": [
        {"hiRes":"https://m.media-amazon.com/images/I/aaa111._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/aaa111._AC_SX679_.jpg"},
        {"hiRes":"https://m.media-amazon.com/images/I/bbb222._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/bbb222._AC_SX679_.jpg"},
        {"hiRes":null,"large":"https://m.media-amazon.com/images/I/ccc333._AC_SX679_.jpg"}
      ]}
    };
    </script>
    <img id="landingImage"
      data-a-dynamic-image='{"https://m.media-amazon.com/images/I/aaa111._AC_SX342_.jpg":[342,342],"https://m.media-amazon.com/images/I/aaa111._AC_SX679_.jpg":[679,679]}'
      src="https://m.media-amazon.com/images/I/aaa111._AC_SX342_.jpg" />
    <div id="altImages">
      <img src="https://m.media-amazon.com/images/I/bbb222._AC_SR38,50_.jpg" />
      <img src="https://m.media-amazon.com/images/I/ccc333._AC_SR38,50_.jpg" />
    </div>
    </body></html>
    """
    soup = BeautifulSoup(html, "html.parser")
    images = _html_images(soup, "B08N5WRWNW", html=html)
    ids = [url.split("/I/")[1].split(".")[0] for url in images]
    assert ids.count("aaa111") == 1
    assert "bbb222" in ids
    assert "ccc333" in ids
    assert all("SL1500" in url for url in images)


def test_ensure_min_images_pads_with_first(monkeypatch):
    monkeypatch.setattr("app.services.product_service.settings.blog_image_min_count", 3)
    padded = _ensure_min_images(["https://img.example/a.jpg"])
    assert padded == [
        "https://img.example/a.jpg",
        "https://img.example/a.jpg",
        "https://img.example/a.jpg",
    ]
    assert _ensure_min_images([]) == []


def test_amazon_classify_falls_back_when_vision_errors(monkeypatch):
    from app.services.product_service import classify_product_images
    import app.services.product_image_filter as image_filter

    monkeypatch.setattr(image_filter.settings, "openai_api_key", "sk-test")

    def _boom(**_kwargs):
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(image_filter, "OpenAI", _boom)
    urls = [
        "https://m.media-amazon.com/images/I/banner.jpg",
        "https://m.media-amazon.com/images/I/hero.jpg",
    ]
    assert classify_product_images(urls, "Test Gadget Pro") == []


def test_amazon_vision_failure_keeps_scrape_order(monkeypatch):
    from pathlib import Path

    from app.services.product_image_filter import reorder_downloaded_product_images

    scraped = [
        (Path("1.jpg"), "https://m.media-amazon.com/images/I/banner.jpg"),
        (Path("2.jpg"), "https://m.media-amazon.com/images/I/chart.jpg"),
        (Path("3.jpg"), "https://m.media-amazon.com/images/I/hero.jpg"),
    ]

    def _fail(_urls, _title):
        raise RuntimeError("vision unavailable")

    monkeypatch.setattr(
        "app.services.product_image_filter.classify_product_images",
        _fail,
    )
    ranked = reorder_downloaded_product_images(scraped, "Test Gadget Pro")
    assert ranked == scraped


def test_amazon_banner_and_size_chart_rank_below_product_shot(monkeypatch):
    from pathlib import Path

    from app.services.product_image_filter import reorder_downloaded_product_images

    hero = "https://m.media-amazon.com/images/I/hero.jpg"
    banner = "https://m.media-amazon.com/images/I/banner.jpg"
    chart = "https://m.media-amazon.com/images/I/chart.jpg"
    scraped = [
        (Path("1.jpg"), banner),
        (Path("2.jpg"), chart),
        (Path("3.jpg"), hero),
    ]
    monkeypatch.setattr(
        "app.services.product_image_filter.classify_product_images",
        lambda _urls, _title: [
            {"url": banner, "category": "banner_text", "score": 6},
            {"url": chart, "category": "size_chart", "score": 11},
            {"url": hero, "category": "product_shot", "score": 94},
        ],
    )
    ranked = reorder_downloaded_product_images(scraped, "Test Gadget Pro")
    assert [url for _path, url in ranked] == [hero, chart, banner]


def test_amazon_pipeline_ranking_never_raises(monkeypatch):
    from pathlib import Path

    from app.services.blog_service import _maybe_rank_product_images

    downloaded = [(Path("1.jpg"), "https://m.media-amazon.com/images/I/a.jpg")]

    def _fail(_downloaded, _title):
        raise RuntimeError("vision ranking exploded")

    monkeypatch.setattr(
        "app.services.product_image_filter.reorder_downloaded_product_images",
        _fail,
    )
    out = _maybe_rank_product_images(
        "https://www.amazon.com/dp/B08N5WRWNW",
        "Test Gadget Pro",
        downloaded,
    )
    assert out == downloaded

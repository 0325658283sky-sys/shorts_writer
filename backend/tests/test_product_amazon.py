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

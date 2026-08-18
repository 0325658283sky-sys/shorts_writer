from bs4 import BeautifulSoup

from app.services.product_service import (
    _channel_uid_from_store_payload,
    _extract_smartstore_channel_uid,
    _smartstore_product_from_api,
    _smartstore_product_from_html,
    is_smartstore_product_url,
    is_supported_product_url,
    parse_smartstore_ref,
)


def test_parse_smartstore_product_url():
    ref = parse_smartstore_ref("https://smartstore.naver.com/seragio/products/294040523")
    assert ref is not None
    assert ref.host_kind == "smartstore"
    assert ref.store_slug == "seragio"
    assert ref.product_id == "294040523"
    assert is_smartstore_product_url("https://smartstore.naver.com/seragio/products/294040523")


def test_parse_brand_store_and_mobile_url():
    brand = parse_smartstore_ref("https://brand.naver.com/nongshim/products/5142184888?nt_source=share")
    assert brand is not None
    assert brand.host_kind == "brand"
    assert brand.store_slug == "nongshim"
    assert brand.product_id == "5142184888"

    mobile = parse_smartstore_ref("https://m.smartstore.naver.com/foo-store/products/1234567890")
    assert mobile is not None
    assert mobile.host_kind == "smartstore"
    assert "smartstore.naver.com/foo-store/products/1234567890" in mobile.source_url


def test_parse_smartstore_rejects_non_product():
    assert parse_smartstore_ref("https://smartstore.naver.com/seragio") is None
    assert parse_smartstore_ref("https://smartstore.naver.com/i/v2/channels/abc/products/1") is None
    assert parse_smartstore_ref("https://blog.naver.com/foo/123") is None
    assert not is_smartstore_product_url("https://www.amazon.com/dp/B08N5WRWNW")


def test_is_supported_product_url():
    assert is_supported_product_url("https://www.amazon.com/dp/B08N5WRWNW")
    assert is_supported_product_url("https://smartstore.naver.com/seragio/products/294040523")
    assert not is_supported_product_url("https://blog.naver.com/foo/123")


def test_extract_channel_uid_from_html_and_store_payload():
    html = """
    <html><script>
      window.__PRELOADED_STATE__ = {"channelUid":"2sWDvOMJt8KO2RJAoa750","productNo":294040523};
    </script></html>
    """
    assert _extract_smartstore_channel_uid(html) == "2sWDvOMJt8KO2RJAoa750"
    assert _channel_uid_from_store_payload({"channelUid": "abcChannelUidXYZ"}) == "abcChannelUidXYZ"
    assert _channel_uid_from_store_payload({"channel": {"channelUid": "nestedUid123"}}) == "nestedUid123"


def test_smartstore_product_from_api_builds_text_and_images():
    ref = parse_smartstore_ref("https://smartstore.naver.com/seragio/products/294040523")
    assert ref is not None
    data = {
        "dispName": "세라디오 테스트 굿즈",
        "discountedSalePrice": 12900,
        "brandName": "Seragio",
        "category": {"wholeCategoryName": "패션잡화>가방"},
        "representImage": {
            "url": "https://shop-phinf.pstatic.net/20240101_1/main.jpg",
        },
        "productImages": [
            {"url": "https://shop-phinf.pstatic.net/20240101_2/a.jpg"},
            {"url": "https://shop-phinf.pstatic.net/20240101_3/b.jpg"},
        ],
        "seoInfo": {"sellerTags": ["데일리", "선물"]},
    }
    product = _smartstore_product_from_api(data, ref)
    assert product is not None
    assert product.title == "세라디오 테스트 굿즈"
    assert "12,900원" in product.text
    assert "데일리" in product.text
    assert len(product.image_urls) >= 3
    assert product.image_urls[0].startswith("https://shop-phinf.pstatic.net/")


def test_rate_limit_page_detection():
    from app.services.product_service import _looks_like_naver_rate_limit

    html = "<html><head><title>[에러] 에러페이지 - 시스템오류</title></head><body>blocked</body></html>"
    assert _looks_like_naver_rate_limit(html)
    assert not _looks_like_naver_rate_limit('<meta property="og:title" content="정상 상품" />' + ("x" * 50000))


def test_embedded_product_json_extraction():
    from app.services.product_service import _extract_embedded_smartstore_product_json

    html = """
    {"id":111222333,"dispName":"임베디드 상품","salePrice":5500,
     "representImage":{"url":"https://shop-phinf.pstatic.net/2024/a.jpg"},
     "productImages":[{"url":"https://shop-phinf.pstatic.net/2024/b.jpg"}]}
    """
    data = _extract_embedded_smartstore_product_json(html, "111222333")
    assert data is not None
    assert data["dispName"] == "임베디드 상품"
    assert data["salePrice"] == 5500


def test_smartstore_product_from_html_og_fallback():
    ref = parse_smartstore_ref("https://smartstore.naver.com/demo/products/111222333")
    assert ref is not None
    html = """
    <html><head>
      <meta property="og:title" content="스마트스토어 샘플 상품" />
      <meta property="og:image" content="https://shop-phinf.pstatic.net/2024/og.jpg" />
    </head>
    <body>
      <script>
        var x = {"dispDiscountedSalePrice":9900,"url":"https://shop-phinf.pstatic.net/2024/extra.jpg"};
      </script>
    </body></html>
    """
    product = _smartstore_product_from_html(html, ref)
    assert product is not None
    assert product.title == "스마트스토어 샘플 상품"
    assert "9,900원" in product.text
    assert any("og.jpg" in url or "extra.jpg" in url for url in product.image_urls)
    soup = BeautifulSoup(html, "html.parser")
    assert soup.select_one('meta[property="og:title"]') is not None


def test_smartstore_classify_falls_back_when_vision_errors(monkeypatch):
    from app.services.product_service import classify_product_images
    import app.services.product_image_filter as image_filter

    monkeypatch.setattr(image_filter.settings, "openai_api_key", "sk-test")

    def _boom(**_kwargs):
        raise RuntimeError("429 rate limit")

    monkeypatch.setattr(image_filter, "OpenAI", _boom)
    urls = [
        "https://shop-phinf.pstatic.net/20240101_1/banner.jpg",
        "https://shop-phinf.pstatic.net/20240101_2/product.jpg",
    ]
    assert classify_product_images(urls, "세라디오 테스트 굿즈") == []


def test_smartstore_vision_failure_keeps_scrape_order(monkeypatch):
    from pathlib import Path

    from app.services.product_image_filter import reorder_downloaded_product_images

    scraped = [
        (Path("a.jpg"), "https://shop-phinf.pstatic.net/20240101_1/banner.jpg"),
        (Path("b.jpg"), "https://shop-phinf.pstatic.net/20240101_2/size.jpg"),
        (Path("c.jpg"), "https://shop-phinf.pstatic.net/20240101_3/product.jpg"),
    ]

    def _fail(_urls, _title):
        raise RuntimeError("vision unavailable")

    monkeypatch.setattr(
        "app.services.product_image_filter.classify_product_images",
        _fail,
    )
    ranked = reorder_downloaded_product_images(scraped, "세라디오 테스트 굿즈")
    assert ranked == scraped


def test_smartstore_pipeline_ranking_never_raises(monkeypatch):
    from pathlib import Path

    from app.services.blog_service import _maybe_rank_product_images

    downloaded = [(Path("1.jpg"), "https://shop-phinf.pstatic.net/20240101_1/a.jpg")]

    def _fail(_downloaded, _title):
        raise RuntimeError("vision ranking exploded")

    monkeypatch.setattr(
        "app.services.product_image_filter.reorder_downloaded_product_images",
        _fail,
    )
    out = _maybe_rank_product_images(
        "https://smartstore.naver.com/seragio/products/294040523",
        "세라디오 테스트 굿즈",
        downloaded,
    )
    assert out == downloaded


def test_smartstore_blog_url_is_not_classified_as_product():
    assert not is_supported_product_url("https://blog.naver.com/foo/123")

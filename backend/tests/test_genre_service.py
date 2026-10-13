from app.services.genre_service import (
    GENRE_CRITERIA_EN,
    GENRE_CRITERIA_KO,
    build_infer_prompt,
    forced_genre,
    heuristic_genre,
    highlight_prompt_clause,
    infer_genre,
    judgement_sentence,
    parse_infer_response,
)
from app.services.template_schema import ALLOWED_GENRES, GENRE_LABELS_KO


def test_criteria_cover_every_genre():
    # A genre with no criteria would quietly fall back and the UI would
    # promise something the prompt never asked for.
    assert set(GENRE_CRITERIA_KO) == set(ALLOWED_GENRES)
    assert set(GENRE_CRITERIA_EN) == set(ALLOWED_GENRES)
    assert all(GENRE_CRITERIA_KO[g].strip() for g in ALLOWED_GENRES)


def test_heuristic_reads_the_title():
    assert heuristic_genre(title="중증외상센터는 왜 무너지는가 | 세바시 1204회").genre == "lecture"
    assert heuristic_genre(title="겨울 패딩 추천 TOP 5 내돈내산 리뷰").genre == "review"
    assert heuristic_genre(title="[예능] 웃참 챌린지 몰카 모음").genre == "entertainment"
    assert heuristic_genre(title="연말정산 바뀐 점 총정리 뉴스 브리핑").genre == "info"
    assert heuristic_genre(title="제주도 여행 브이로그 하루 일상").genre == "vlog"


def test_heuristic_falls_back_when_nothing_matches():
    guess = heuristic_genre(title="무제", channel="", transcript_text="음...")
    assert guess.genre == "any"
    assert guess.source == "default"
    assert guess.evidence


def test_weak_evidence_does_not_claim_a_genre():
    # One soft speech hit is not enough to label a whole video.
    guess = heuristic_genre(title="제목", transcript_text="오늘은 날씨가 좋네요")
    assert guess.genre == "any"
    assert guess.source == "default"


def test_heuristic_is_deterministic_on_ties():
    a = heuristic_genre(title="리뷰 강연", channel="리뷰 강연")
    b = heuristic_genre(title="리뷰 강연", channel="리뷰 강연")
    assert a.genre == b.genre


def test_guess_always_carries_label_and_criteria():
    for title in ("세바시 강연", "언박싱 후기", "아무 말", ""):
        guess = heuristic_genre(title=title)
        assert guess.genre in ALLOWED_GENRES
        assert guess.label == GENRE_LABELS_KO[guess.genre]
        assert guess.criteria == GENRE_CRITERIA_KO[guess.genre]
        assert guess.evidence.strip()


def test_parse_handles_what_models_actually_return():
    assert parse_infer_response('{"genre":"lecture","evidence":"한 사람이 길게 설명해요"}') == (
        "lecture",
        "한 사람이 길게 설명해요",
    )
    # fenced output
    assert parse_infer_response('```json\n{"genre":"vlog","evidence":"장면이 자주 바뀌어요"}\n```')[0] == "vlog"
    # junk and edge cases never raise
    for bad in (None, "", "not json", "[]", '{"genre":"opera"}', '{"evidence":"x"}', "{}"):
        genre, _ = parse_infer_response(bad)
        assert genre is None


def test_parse_keeps_evidence_only_when_usable():
    _, evidence = parse_infer_response('{"genre":"info","evidence":"   "}')
    assert evidence is None
    _, evidence = parse_infer_response('{"genre":"info","evidence":"' + "길" * 400 + '"}')
    assert evidence is not None and len(evidence) <= 200


def test_infer_without_a_client_uses_the_heuristic():
    guess = infer_genre(title="세바시 강연", complete=None)
    assert guess.genre == "lecture"
    assert guess.source == "heuristic"


def test_infer_prefers_the_model():
    def complete(system, user):
        assert "genre" in system
        assert "세바시" in user
        return '{"genre":"entertainment","evidence":"말이 겹치고 빨라져요"}'

    guess = infer_genre(title="세바시 강연", complete=complete)
    assert guess.genre == "entertainment"
    assert guess.source == "model"
    assert guess.evidence == "말이 겹치고 빨라져요"
    # criteria must follow the model's genre, not the heuristic's
    assert guess.criteria == GENRE_CRITERIA_KO["entertainment"]


def test_a_failing_model_never_breaks_the_conversion():
    def boom(system, user):
        raise RuntimeError("502")

    guess = infer_genre(title="세바시 강연", complete=boom)
    assert guess.genre == "lecture"
    assert guess.source == "heuristic"


def test_an_unusable_model_answer_falls_back():
    guess = infer_genre(title="세바시 강연", complete=lambda s, u: "글쎄요")
    assert guess.genre == "lecture"
    assert guess.source == "heuristic"


def test_prompt_is_bounded_and_labelled():
    prompt = build_infer_prompt("제목", "채널", "가" * 9000, limit=500)
    assert "제목:" in prompt and "채널:" in prompt and "전사 앞부분:" in prompt
    assert prompt.count("가") == 500
    empty = build_infer_prompt(None, None, None)
    assert "(없음)" in empty


def test_judgement_says_what_why_and_under_what_settings():
    guess = heuristic_genre(title="중증외상센터는 왜 무너지는가 | 세바시 1204회")
    line = judgement_sentence(guess, 8)
    assert "강연·인터뷰로 보고 8개를 찾았어요" in line
    assert guess.criteria in line
    assert "전체 구간" in line and "길이 자동" in line

    none_found = judgement_sentence(guess, 0)
    assert "찾지 못했어요" in none_found


def test_judgement_takes_the_real_settings():
    guess = heuristic_genre(title="세바시")
    line = judgement_sentence(guess, 3, range_label="01:17 – 12:16", length_label="30–60초")
    assert "01:17 – 12:16" in line and "30–60초" in line


def test_prompt_clause_is_english_for_every_genre():
    for genre in ALLOWED_GENRES:
        guess = heuristic_genre(title="x")
        guess.genre = genre
        clause = highlight_prompt_clause(guess)
        assert clause.strip()
        # The surrounding highlight prompt is English; a Korean clause in the
        # middle of it makes models follow the instruction less reliably.
        assert not any("가" <= ch <= "힣" for ch in clause), genre


def test_forced_genre_is_marked_as_the_users_own():
    # The judgement bar must not claim it inferred something it was handed.
    guess = forced_genre("review")
    assert guess.genre == "review"
    assert guess.source == "user"
    assert guess.label == GENRE_LABELS_KO["review"]
    assert guess.criteria == GENRE_CRITERIA_KO["review"]


def test_forced_genre_falls_back_instead_of_raising():
    # A bad genre is not worth failing a paid re-analysis over; the bar says
    # which one was actually used.
    for value in ("nonsense", "", "   ", "REVIEW"):
        guess = forced_genre(value)
        assert guess.genre in ALLOWED_GENRES
    assert forced_genre("REVIEW").genre == "review"
    assert forced_genre("nonsense").genre == "any"


def test_judgement_particle_follows_the_label():
    # 로 after a vowel or final ㄹ, 으로 otherwise. Four of the six labels
    # need 으로, and "리뷰·상품로" is simply wrong Korean.
    assert judgement_sentence(forced_genre("review"), 3).startswith("리뷰·상품으로 보고")
    assert judgement_sentence(forced_genre("lecture"), 3).startswith("강연·인터뷰로 보고")
    assert judgement_sentence(forced_genre("info"), 3).startswith("정보·뉴스로 보고")
    assert judgement_sentence(forced_genre("vlog"), 3).startswith("브이로그·일상으로 보고")


def test_default_genre_does_not_say_it_looked_automatically():
    # "자동으로 보고" reads as "saw it automatically", not "committed to no
    # genre", which is what `any` means.
    line = judgement_sentence(forced_genre("any"), 5)
    assert line.startswith("특정 장르로 보지 않고")
    assert "자동으로 보고" not in line

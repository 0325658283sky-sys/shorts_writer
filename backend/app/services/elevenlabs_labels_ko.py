"""ElevenLabs 보이스 카드를 한글로 보여주기 위한 표시용 사전. 사전에 없는 값은 원문을 그대로 쓴다."""

from __future__ import annotations

import re

NAME_KO = {
    "roger": "로저", "sarah": "세라", "laura": "로라", "charlie": "찰리", "george": "조지",
    "callum": "캘럼", "river": "리버", "harry": "해리", "liam": "리암", "alice": "앨리스",
    "matilda": "마틸다", "will": "윌", "jessica": "제시카", "eric": "에릭", "bella": "벨라",
    "chris": "크리스", "brian": "브라이언", "daniel": "대니얼", "lily": "릴리", "adam": "아담",
    "bill": "빌", "eunha": "은하", "mono beige": "모노 베이지", "kanna": "칸나",
}

GENDER_KO = {"male": "남성", "female": "여성", "neutral": "중성"}
AGE_KO = {
    "young": "청년", "middle_aged": "중년", "middle aged": "중년", "old": "시니어",
    "teen": "청소년", "child": "어린이",
}
ACCENT_KO = {
    "american": "미국", "british": "영국", "australian": "호주", "seoul": "서울",
    "standard": "표준어", "korean": "한국어", "irish": "아일랜드", "indian": "인도",
}
USE_CASE_KO = {
    "conversational": "대화형", "narrative_story": "스토리텔링", "social_media": "SNS",
    "entertainment_tv": "방송·엔터", "characters_animation": "캐릭터", "advertisement": "광고",
    "informative_educational": "정보·교육", "news": "뉴스", "audiobook": "오디오북",
}
DESCRIPTIVE_KO = {
    "classy": "세련된", "professional": "전문적인", "sassy": "당찬", "hyped": "들뜬",
    "mature": "성숙한", "calm": "차분한", "rough": "거친", "upbeat": "경쾌한", "chill": "느긋한",
    "cute": "귀여운", "casual": "편안한", "formal": "격식 있는", "confident": "자신감 있는",
    "crisp": "또렷한", "gentle": "부드러운", "warm": "따뜻한", "friendly": "친근한",
}

# "Roger - Laid-Back, Casual, Resonant"의 설명부 단어
TRAIT_KO = {
    "laid-back": "여유로운", "casual": "편안한", "resonant": "울림 있는", "mature": "성숙한",
    "reassuring": "안정감 있는", "confident": "자신감 있는", "enthusiast": "열정적인",
    "quirky attitude": "톡톡 튀는", "deep": "깊은", "energetic": "활기찬", "warm": "따뜻한",
    "captivating storyteller": "몰입되는 이야기꾼", "husky trickster": "허스키한 장난꾸러기",
    "relaxed": "느긋한", "neutral": "중립적인", "informative": "정보 전달형", "fierce warrior": "거친 전사",
    "social media creator": "SNS 크리에이터", "clear": "또렷한", "engaging educator": "몰입되는 강사",
    "knowledgable": "박식한", "professional": "전문적인", "relaxed optimist": "느긋한 낙천가",
    "playful": "장난스러운", "bright": "밝은", "smooth": "매끄러운", "trustworthy": "믿음직한",
    "charming": "매력적인", "down-to-earth": "털털한", "resonant and comforting": "울림 있고 편안한",
    "steady broadcaster": "안정적인 방송인", "velvety actress": "벨벳 같은 배우", "dominant": "강한",
    "firm": "단호한", "wise": "지혜로운", "balanced": "균형 잡힌", "elegant korean female": "우아한 한국 여성",
    "calm & contemporary": "차분하고 현대적인", "calm & friendly": "차분하고 친근한",
}


def _split_name(raw: str) -> tuple[str, str]:
    if " - " in raw:
        name, traits = raw.split(" - ", 1)
        return name.strip(), traits.strip()
    return raw.strip(), ""


def voice_name_ko(raw_name: str) -> str:
    name, _ = _split_name(raw_name)
    key = re.sub(r"\s+", " ", name.lower()).strip()
    return NAME_KO.get(key, name)


def voice_traits_ko(raw_name: str) -> list[str]:
    _, traits = _split_name(raw_name)
    if not traits:
        return []
    whole = TRAIT_KO.get(traits.lower())
    if whole:
        return [whole]
    words = [part.strip() for part in traits.split(",") if part.strip()]
    return [TRAIT_KO[word.lower()] for word in words if word.lower() in TRAIT_KO]


def voice_labels_ko(labels: dict) -> list[str]:
    parts: list[str] = []
    for key, table in (
        ("gender", GENDER_KO), ("age", AGE_KO), ("accent", ACCENT_KO),
        ("use_case", USE_CASE_KO), ("descriptive", DESCRIPTIVE_KO),
    ):
        value = labels.get(key)
        if value:
            parts.append(table.get(str(value).lower(), str(value)))
    return parts

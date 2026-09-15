"""Conservative payee candidate matching for speech transcripts."""

import re
from difflib import SequenceMatcher

try:
    from pypinyin import lazy_pinyin
except ImportError:  # Text matching remains available in non-voice installs.
    lazy_pinyin = None


def _normalize(value):
    return "".join(re.findall(r"[\w\u3400-\u9fff]+", str(value).lower()))


def _tokens(payee):
    values = [payee.get("name", "")]
    values.extend(re.split(r"[\s,，/、;；]+", payee.get("alias", "")))
    return {_normalize(value) for value in values if _normalize(value)}


def _phonetic(value):
    normalized = _normalize(value)
    if not normalized or lazy_pinyin is None:
        return normalized
    return "".join(lazy_pinyin(normalized))


def _score(query, payee):
    normalized = _normalize(query)
    if not normalized:
        return 0
    tokens = _tokens(payee)
    if normalized == _normalize(payee.get("phone", "")):
        return 110
    if normalized in tokens:
        return 100
    if any(normalized in token or token in normalized for token in tokens):
        return 88
    query_sound = _phonetic(normalized)
    sounds = {_phonetic(token) for token in tokens}
    if query_sound and query_sound in sounds:
        return 96
    similarities = [SequenceMatcher(None, query_sound, sound).ratio() for sound in sounds if sound]
    return round(max(similarities, default=0) * 90)


def match_payee_candidates(query, payees, minimum_score=68, score_window=25):
    """Return plausible candidates; ambiguity is intentionally preserved."""
    scored = [(_score(query, payee), payee) for payee in payees]
    scored = [(score, payee) for score, payee in scored if score >= minimum_score]
    if not scored:
        return []
    scored.sort(key=lambda item: (-item[0], item[1].get("name", ""), item[1].get("account_id", "")))
    best = scored[0][0]
    return [payee for score, payee in scored if score >= best - score_window]


def select_payee(text, candidates):
    """Resolve a spoken choice by ordinal, full account id, or last four characters."""
    normalized = _normalize(text)
    ordinal_patterns = (
        (0, r"(?:第(?:一|1)|(?:选择|选)(?:一|1))(?:个|位)?"),
        (1, r"(?:第(?:二|两|2)|(?:选择|选)(?:二|两|2))(?:个|位)?"),
        (2, r"(?:第(?:三|3)|(?:选择|选)(?:三|3))(?:个|位)?"),
        (3, r"(?:第(?:四|4)|(?:选择|选)(?:四|4))(?:个|位)?"),
        (4, r"(?:第(?:五|5)|(?:选择|选)(?:五|5))(?:个|位)?"),
    )
    for index, pattern in ordinal_patterns:
        if index < len(candidates) and re.search(pattern, normalized):
            return candidates[index]
    mentioned = []
    for payee in candidates:
        account = _normalize(payee.get("account_id", ""))
        if account and (account in normalized or account[-4:] in normalized):
            mentioned.append(payee)
    return mentioned[0] if len(mentioned) == 1 else None


def candidate_prompt(candidates):
    choices = "；".join(
        f"第{index}位，{payee['name']}，账户尾号 {payee['account_id'][-4:]}"
        for index, payee in enumerate(candidates, start=1)
    )
    return f"找到多个发音相近的收款人：{choices}。请说“选择第几位”或账户尾号。"

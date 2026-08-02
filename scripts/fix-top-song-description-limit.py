from pathlib import Path

path = Path('custom-gpt/stashbox-radio/openapi.yaml')
text = path.read_text()
old = '''      description: |
        Read-only live song analytics. This operation never creates drafts, renders, schedules, uploads, or publications.
        Natural-language mapping rules for the Custom GPT:
        - "most played" or "top played" means metric=plays.
        - "most liked" means metric=likes.
        - "most shared" means metric=shares.
        - A genre word such as "reggae" must be passed through the genre query parameter.
        - A requested count such as "five" or "top 5" must be passed through limit=5.
        Example: "Give me the 5 most played reggae songs" maps to metric=plays, genre=Reggae, limit=5, period=all_time.
'''
new = '''      description: Read-only live song rankings. Supports metric, genre, artist, limit, and all-time filters. Never creates drafts, renders, schedules, uploads, or publications.
'''
if old not in text:
    raise SystemExit('Expected long top-song description was not found.')
text = text.replace(old, new, 1)
path.write_text(text)
print('Shortened getTopSongAnalytics description below 300 characters.')

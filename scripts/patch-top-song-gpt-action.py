from pathlib import Path

path = Path('custom-gpt/stashbox-radio/openapi.yaml')
text = path.read_text()

text = text.replace('version: 0.9.2', 'version: 0.9.3', 1)

old = '''      summary: Rank Stashbox songs by an all-time engagement metric using live Radio dashboard totals.\n      description: Read-only song analytics. This operation never creates drafts, renders, schedules, uploads, or publications.\n      parameters:\n        - name: metric\n          in: query\n          required: true\n          schema:\n            type: string\n            enum: [plays, full_plays, likes, shares, share_visits, video_clicks, product_clicks, listening_seconds]\n'''
new = '''      summary: Get the most played, liked, shared, or otherwise top-performing Stashbox songs, optionally filtered by genre or artist.\n      description: |\n        Read-only live song analytics. This operation never creates drafts, renders, schedules, uploads, or publications.\n        Natural-language mapping rules for the Custom GPT:\n        - "most played" or "top played" means metric=plays.\n        - "most liked" means metric=likes.\n        - "most shared" means metric=shares.\n        - A genre word such as "reggae" must be passed through the genre query parameter.\n        - A requested count such as "five" or "top 5" must be passed through limit=5.\n        Example: "Give me the 5 most played reggae songs" maps to metric=plays, genre=Reggae, limit=5, period=all_time.\n      parameters:\n        - name: metric\n          in: query\n          required: false\n          description: Ranking metric. Default to plays when the user asks for top or most-played songs without naming another metric.\n          schema:\n            type: string\n            enum: [plays, full_plays, likes, shares, share_visits, video_clicks, product_clicks, listening_seconds]\n            default: plays\n          example: plays\n'''
if old not in text:
    raise SystemExit('Top-song operation block was not found')
text = text.replace(old, new, 1)

old_genre = '''        - name: genre\n          in: query\n          required: false\n          schema:\n            type: string\n'''
new_genre = '''        - name: genre\n          in: query\n          required: false\n          description: Case-insensitive Song CMS genre filter. Pass genre words from the user request directly, for example Reggae.\n          schema:\n            type: string\n          example: Reggae\n'''
if old_genre not in text:
    raise SystemExit('Genre parameter block was not found')
text = text.replace(old_genre, new_genre, 1)

path.write_text(text)
print('Patched getTopSongAnalytics for deterministic natural-language mapping.')

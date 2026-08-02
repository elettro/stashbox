from pathlib import Path
import re

path = Path('custom-gpt/stashbox-radio/openapi.yaml')
text = path.read_text()

text = text.replace('  version: 0.9.3', '  version: 0.9.4', 1)

pattern = re.compile(
    r"(  /social/analytics/top-songs:\n(?:.|\n)*?      responses:\n)"
    r"(?:.|\n)*?"
    r"(?=  /social/orchestration/candidates:)",
    re.MULTILINE,
)

match = pattern.search(text)
if not match:
    raise SystemExit('Could not locate top-song analytics response block')

prefix = match.group(1)
replacement = prefix + """        '200':
          description: Ranked song analytics response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericResponse'
"""

text = text[:match.start()] + replacement + text[match.end():]
path.write_text(text)
print('Updated top-song analytics response schema to GenericResponse')

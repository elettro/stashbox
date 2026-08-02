from pathlib import Path

path = Path('custom-gpt/stashbox-radio/openapi.yaml')
text = path.read_text(encoding='utf-8')

old = """  /social/review-items/{reviewId}/schedule/cancel:
    post:
      operationId: cancelScheduledSocialContent
      summary: Cancel a scheduled publication.
      parameters:
        - name: reviewId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200': {description: Cancellation result, content: {application/json: {schema: {$ref: '#/components/schemas/GenericResponse'}}}}
"""

new = """  /social/review-items/{reviewId}/schedule/cancel:
    post:
      operationId: cancelScheduledSocialContent
      summary: Validate or cancel a scheduled publication.
      description: Omit or set confirm_cancel_schedule to false for validation only. Set it to true only after explicit user confirmation to execute the cancellation.
      parameters:
        - name: reviewId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [confirm_cancel_schedule]
              properties:
                confirm_cancel_schedule:
                  type: boolean
                  default: false
                  description: Must be true to execute cancellation. False performs validation only.
              additionalProperties: false
      responses:
        '200': {description: Cancellation validation or execution result, content: {application/json: {schema: {$ref: '#/components/schemas/GenericResponse'}}}}
"""

if new in text:
    print('OpenAPI cancellation confirmation is already present.')
elif old not in text:
    raise SystemExit('Expected cancellation operation block was not found; refusing to modify the schema.')
else:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('Updated Custom GPT cancellation operation.')

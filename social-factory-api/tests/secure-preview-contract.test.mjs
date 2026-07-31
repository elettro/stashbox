import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewActionService } from '../review-actions.mjs';
const id='render-c694a998-9548-46f3-b2c2-be194aacb2ef';
const item={id,status:'in_review',approval_state:'pending',publishing_status:'not_published',metadata:{selected_title:'Party Spots and Waves (Newport Beach)'},publish_settings:{visibility:'unlisted',scheduled_at:null},video:{bucket:'b',object_key:'incoming/v.mp4',content_type:'video/mp4',file_name:'v.mp4'}};
function make(){let writes=0;return {writes:()=>writes,s:createReviewActionService({secretStore:{async read(){return {admin_token:'t'}}},configSecretId:'x',store:{async getReview(){return structuredClone(item)},async putReview(){writes++},async createPreviewUrl(){return 'https://s.example/?credential=x'}}})}}
const event=(extra={})=>({headers:{'x-admin-token':'t',...extra}});
test('browser response includes internal signed URL and stable absolute URL',async()=>{const x=make(),r=await x.s.preview(event(),id);assert.equal(r.expires_in_seconds,900);assert.ok(r.preview_url);assert.equal(r.review_page_url,`https://stashbox.com/radio-admin/dev/social-factory/content-review/preview/?review_id=${id}`);assert.equal(x.writes(),0)});
test('Custom GPT actor response omits preview_url',async()=>{const x=make(),r=await x.s.preview(event({'x-stashbox-actor':'stashbox-radio-gpt'}),id);assert.equal('preview_url' in r,false);assert.ok(r.review_page_url);assert.equal(x.writes(),0)});
test('Custom GPT actor type response omits preview_url',async()=>{const x=make(),r=await x.s.preview(event({'x-stashbox-actor-type':'custom_gpt'}),id);assert.equal('preview_url' in r,false);assert.ok(r.review_page_url);assert.equal(x.writes(),0)});
test('authorization-header fallback omits preview_url',async()=>{const x=make(),r=await x.s.preview(event({authorization:'Bearer gpt'}),id);assert.equal('preview_url' in r,false);assert.ok(r.review_page_url);assert.equal(x.writes(),0)});
test('invalid auth rejected and read-only',async()=>{const x=make();await assert.rejects(()=>x.s.preview({headers:{'x-admin-token':'bad'}},id),/unauthorized/);assert.equal(x.writes(),0)});

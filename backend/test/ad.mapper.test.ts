import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  mapAd, toRow, AD_COLUMNS, SYNC_COLUMNS, EXTRACTED_REFERENCE_COLUMNS, EXTRACTED_COPY_COLUMNS,
} from '../src/mappers/ad.mapper.js'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/actor-item.json', import.meta.url), 'utf8')
)

const CTX = { keyword: '뉴트리원', scrapedAt: '2026-07-22T12:00:00.000Z' }

test('maps a realistic camelCase actor item to all 20 columns', () => {
  const mapped = mapAd(fixture, CTX)

  assert.deepEqual(mapped, {
    'Ad Archive ID': '1234567890123456',
    'Brand': '뉴트리원',
    'Status': '게재중',
    'Start Date': '2025-07-01',
    'End Date': '2025-07-31',
    'Date Scraped': '2026-07-22T12:00:00.000Z',
    'Search Keyword': '뉴트리원',
    'Display Format': 'DCO',
    'Post Content': '장 건강, 하루 한 포로 챙기세요!',
    'Title': '장 건강엔 유산균',
    'Bottom Content': '1+1 특가 이벤트',
    'CTA Text': '지금 구매하기',
    'Landing URL': 'https://smartstore.example.com/nutrione',
    'Image Links': [
      'https://scontent.example.com/img1_orig.jpg',
      'https://scontent.example.com/card1_orig.jpg',
      'https://scontent.example.com/card2_small.jpg',
    ].join('\n'),
    'Archived Image Links': '',
    'Archived Thumbnail': '',
    'Video Link': 'https://video.example.com/card1_hd.mp4',
    'Video Thumbnail': 'https://scontent.example.com/card1_preview.jpg',
    'Variant Count': 4,
    'Platforms': 'FACEBOOK, INSTAGRAM',
    'Ad Library URL': 'https://www.facebook.com/ads/library/?id=1234567890123456',
    'Page ID': '111222333444555',
  })
})

test('supports snake_case actor output', () => {
  const mapped = mapAd({
    ad_archive_id: '999',
    page_name: '닥터린',
    page_id: '777',
    is_active: false,
    start_date: '2025-06-01',
    collation_count: 0,
    publisher_platform: 'FACEBOOK',
    snapshot: {
      display_format: 'VIDEO',
      link_description: '하단 문구',
      cta_text: '더 알아보기',
      link_url: 'https://example.com',
      body: { text: '본문' },
      videos: [{ video_sd_url: 'https://video.example.com/sd.mp4', video_preview_image_url: 'https://img.example.com/prev.jpg' }],
    },
  }, CTX)

  assert.equal(mapped['Ad Archive ID'], '999')
  assert.equal(mapped['Brand'], '닥터린')
  assert.equal(mapped['Status'], '종료')
  assert.equal(mapped['Start Date'], '2025-06-01')
  assert.equal(mapped['Display Format'], 'VIDEO')
  assert.equal(mapped['Bottom Content'], '하단 문구')
  assert.equal(mapped['CTA Text'], '더 알아보기')
  assert.equal(mapped['Landing URL'], 'https://example.com')
  assert.equal(mapped['Video Link'], 'https://video.example.com/sd.mp4')
  assert.equal(mapped['Video Thumbnail'], 'https://img.example.com/prev.jpg')
  assert.equal(mapped['Variant Count'], 0, 'collation_count of 0 must survive, not collapse to ""')
  assert.equal(mapped['Platforms'], 'FACEBOOK')
  assert.equal(mapped['Ad Library URL'], 'https://www.facebook.com/ads/library/?id=999')
  assert.equal(mapped['Page ID'], '777')
})

test('handles a near-empty item without throwing', () => {
  const mapped = mapAd({}, CTX)

  assert.equal(mapped['Ad Archive ID'], '')
  assert.equal(mapped['Status'], '')
  assert.equal(mapped['Ad Library URL'], '', 'no fallback URL when there is no archive ID')
  assert.equal(mapped['Image Links'], '')
  assert.equal(mapped['Video Link'], '')
  assert.equal(mapped['Search Keyword'], '뉴트리원')
  assert.equal(mapped['Date Scraped'], CTX.scrapedAt)
})

test('toRow keeps all 24 columns (22 sync + 1 extracted-reference + 1 extracted-copy) in sheet order', () => {
  const row = toRow(mapAd(fixture, CTX))

  assert.equal(row.length, 24)
  assert.equal(row[0], '1234567890123456')
  assert.equal(row[AD_COLUMNS.indexOf('Brand')], '뉴트리원')
  assert.equal(AD_COLUMNS.indexOf('Archived Image Links'), 13, 'archived links sit right before Image Links (col N)')
  assert.equal(AD_COLUMNS.indexOf('Image Links'), 14)
  assert.equal(AD_COLUMNS.indexOf('Video Link'), 15)
  assert.equal(AD_COLUMNS.indexOf('Archived Thumbnail'), 16, 'archived thumbnail sits right before Video Thumbnail')
  assert.equal(AD_COLUMNS.indexOf('Video Thumbnail'), 17)
  assert.equal(row[AD_COLUMNS.indexOf('Page ID')], '111222333444555')
  assert.equal(
    AD_COLUMNS.indexOf('Extracted Reference JSON'), 22,
    'Part N: appended after every sync column — existing 22 columns keep their positions'
  )
  assert.equal(row[22], '', 'blank until the separate ad-extraction path fills it')
  assert.equal(
    AD_COLUMNS.indexOf('Extracted Copy JSON'), 23,
    'Part O: appended after Extracted Reference JSON too — existing 23 columns keep their positions'
  )
  assert.equal(row[23], '', 'blank until the separate ad-extraction path fills it')
})

test('SYNC_COLUMNS/EXTRACTED_REFERENCE_COLUMNS/EXTRACTED_COPY_COLUMNS split composes AD_COLUMNS exactly, and mapAd never touches either extraction-owned column', () => {
  assert.deepEqual(AD_COLUMNS, [...SYNC_COLUMNS, ...EXTRACTED_REFERENCE_COLUMNS, ...EXTRACTED_COPY_COLUMNS])
  assert.equal(SYNC_COLUMNS.length, 22)
  assert.equal(EXTRACTED_REFERENCE_COLUMNS.length, 1)
  assert.equal(EXTRACTED_COPY_COLUMNS.length, 1)

  const mapped = mapAd(fixture, CTX)
  assert.equal(
    'Extracted Reference JSON' in mapped, false,
    'a resync must never overwrite Part N extraction results — mapAd simply never produces this key'
  )
  assert.equal(
    'Extracted Copy JSON' in mapped, false,
    'a resync must never overwrite Part O extraction results — mapAd simply never produces this key'
  )
})

test('toRow round-trips a real Extracted Reference JSON value (Part N) unchanged', () => {
  const reference = { imageUrl: 'https://drive.google.com/file/d/abc/view', extractedAt: '2026-08-04T00:00:00.000Z' }
  const row = toRow({ ...mapAd(fixture, CTX), 'Extracted Reference JSON': JSON.stringify(reference) })

  assert.deepEqual(JSON.parse(String(row[22])), reference)
})

test('toRow round-trips a real Extracted Copy JSON value (Part O) unchanged', () => {
  const copy = { price: '29,900원', promotion: '오늘만 71% 특가', adHooks: ['운동&식단 필요없는 지방흡착템', '아마존 1등'] }
  const row = toRow({ ...mapAd(fixture, CTX), 'Extracted Copy JSON': JSON.stringify(copy) })

  assert.deepEqual(JSON.parse(String(row[23])), copy)
})

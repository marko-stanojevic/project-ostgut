INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '9617a958-0601-11e8-ae97-52543be04c81', 'Radio Paradise Main Mix (EU) 320k AAC', 'http://stream-uk1.radioparadise.com/aac-320', 'https://radioparadise.com/', 'https://radioparadise.com/apple-touch-icon.png',
  '{World}'::text[], 'english', 'The United States Of America', 'US', '{california,eclectic,free,internet,non-commercial,paradise,radio}'::text[],
  '320'::int, 'AAC', '0.71104'::float8,
  true, 'pending', 'f'::bool,
  'Radio Paradise Main Mix', NULL, NULL, NULL,
  '2026-04-15 20:56:57.539857+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '960d3f6f-0601-11e8-ae97-52543be04c81', 'SomaFM Space Station Soma (128k AAC)', 'https://ice5.somafm.com/spacestation-128-aac', 'https://somafm.com/spacestation/', 'https://somafm.com/img3/spacestation-400.png',
  '{Electronic}'::text[], 'english', 'The United States Of America', 'US', '{ambient,electronica,mid-tempo}'::text[],
  '128'::int, 'AAC', '0.70072'::float8,
  true, 'approved', 't'::bool,
  'SomaFM Space Station Soma', NULL, NULL, NULL,
  '2026-04-15 20:56:57.637521+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '961e37ee-0601-11e8-ae97-52543be04c81', 'SomaFM Left Coast 70s (320k MP3)', 'https://ice5.somafm.com/seventies-320-mp3', 'https://somafm.com/seventies/', 'https://somafm.com/img3/seventies400.jpg',
  '{Rock}'::text[], 'english', 'The United States Of America', 'US', '{"easy listening","mellow album rock",rock,"yacht rock"}'::text[],
  '320'::int, 'MP3', '0.7010799999999999'::float8,
  true, 'approved', 'f'::bool,
  'SomaFM Left Coast 70s', NULL, NULL, NULL,
  '2026-04-15 20:56:57.655547+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '9617ccb4-0601-11e8-ae97-52543be04c81', '1.FM - Blues Radio', 'http://strm112.1.fm/blues_mobile_mp3', 'https://www.1.fm/', '',
  '{Blues}'::text[], 'english', 'Switzerland', 'CH', '{blues}'::text[],
  '192'::int, 'MP3', '0.7006899999999999'::float8,
  true, 'pending', 'f'::bool,
  '1.FM - Blues Radio', NULL, NULL, NULL,
  '2026-04-15 20:56:57.743343+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  'ffe33802-6417-11e9-a622-52543be04c81', 'SomaFM Boot Liquor (320k MP3)', 'https://ice4.somafm.com/bootliquor-320-mp3', 'https://somafm.com/bootliquor/', 'https://somafm.com/img3/bootliquor-400.jpg',
  '{Country}'::text[], 'english', 'The United States Of America', 'US', '{americana,country}'::text[],
  '320'::int, 'MP3', '0.17721'::float8,
  true, 'approved', 'f'::bool,
  'SomaFM Boot Liquor', NULL, NULL, NULL,
  '2026-04-15 20:56:58.334513+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '6a7508a9-27ab-11e8-91bf-52543be04c81', 'KEXP 90.3 Seattle, WA', 'http://live-mp3-128.kexp.org/kexp128.mp3', 'http://www.kexp.org/', 'http://www.kexp.org/static/assets/img/favicon-32x32.png',
  '{Rock}'::text[], 'english', 'The United States Of America', 'US', '{"alternative rock",indie,live,"public radio",seattle,variety}'::text[],
  '128'::int, 'MP3', '0.13455'::float8,
  true, 'approved', 't'::bool,
  'KEXP 90.3 Seattle', NULL, NULL, NULL,
  '2026-04-15 20:56:58.546975+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '961e6cac-0601-11e8-ae97-52543be04c81', 'NTS Radio 1', 'http://stream-relay-geo.ntslive.net/stream', 'http://www.nts.live/', 'http://www.nts.live/favicon.ico',
  '{World}'::text[], 'english', 'The United Kingdom Of Great Britain And Northern Ireland', 'GB', '{"community radio","dj sets",eclectic,freeform}'::text[],
  '256'::int, 'MP3', '0.11883999999999999'::float8,
  true, 'approved', 'f'::bool,
  NULL, NULL, NULL, NULL,
  '2026-04-15 20:56:58.660998+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '960a4ad1-0601-11e8-ae97-52543be04c81', 'WWOZ 90.7 New Orleans, LA', 'http://wwoz-sc.streamguys.com/wwoz-hi.mp3', 'http://www.wwoz.org/', '',
  '{Jazz}'::text[], 'english', 'The United States Of America', 'US', '{blues,jazz,"new orleans",non-commercial}'::text[],
  '128'::int, 'MP3', '0.0982'::float8,
  true, 'approved', 't'::bool,
  'WWOZ 90.7 New Orleans, LA', NULL, NULL, NULL,
  '2026-04-15 20:56:58.854467+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '9618344a-0601-11e8-ae97-52543be04c81', 'WFMU 91.1 East Orange, NJ', 'http://stream2.wfmu.org/freeform-128k', 'https://wfmu.org/', '',
  '{World}'::text[], 'english', 'The United States Of America', 'US', '{"east orange",freeform,"jersey city","new york city","no ads",non-commercial}'::text[],
  '128'::int, 'MP3', '0.09553999999999999'::float8,
  true, 'approved', 't'::bool,
  'WFMU 91.1 East Orange', NULL, NULL, NULL,
  '2026-04-15 20:56:58.887502+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '9634ab94-0601-11e8-ae97-52543be04c81', 'NTS Radio 2', 'http://stream-relay-geo.ntslive.net/stream2', 'http://www.nts.live/', 'http://www.nts.live/apple-touch-icon.png?v=47re43rrzb',
  '{World}'::text[], 'english', 'The United Kingdom Of Great Britain And Northern Ireland', 'GB', '{"community radio","dj sets",eclectic,freeform}'::text[],
  '256'::int, 'MP3', '0.08736'::float8,
  true, 'approved', 'f'::bool,
  NULL, NULL, NULL, NULL,
  '2026-04-15 20:56:58.994897+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '3487079b-91b1-4fb8-b315-c4150e705b7a', 'WBGO Jazz 88.3 FM', 'https://ais-sa8.cdnstream1.com/3629_128.mp3', 'https://www.wbgo.org/', 'https://npr.brightspotcdn.com/dims4/default/76ee71f/2147483647/strip/true/crop/200x100+0+0/resize/400x200!/format/webp/quality/90/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fa7%2F2f%2Fbfa4b00449099118e45fefe81fe8%2Fwbgo-logo-200x100.png',
  '{Jazz}'::text[], 'english', 'The United States Of America', 'US', '{jazz}'::text[],
  '128'::int, 'MP3', '0.04499'::float8,
  true, 'approved', 't'::bool,
  'WBGO Jazz 88.3 FM', NULL, NULL, NULL,
  '2026-04-15 20:57:00.018271+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '960dd7a5-0601-11e8-ae97-52543be04c81', 'WXPN 88.5 Philadelphia, PA', 'https://wxpnhi.xpn.org/xpnhi', 'http://www.xpn.org/', 'http://www.xpn.org/favicon.ico',
  '{Rock}'::text[], 'english', 'The United States Of America', 'US', '{blues,folk,"public radio",rock}'::text[],
  '128'::int, 'MP3', '0.03315'::float8,
  true, 'pending', 'f'::bool,
  'WXPN 88.5 Philadelphia, PA', NULL, NULL, NULL,
  '2026-04-15 20:57:00.613824+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '9609b366-0601-11e8-ae97-52543be04c81', 'WFUV 90.7 Fordham University - New York, NY', 'http://wfuv-onair.streamguys.org/onair-hi', 'http://www.wfuv.org/', '',
  '{World}'::text[], 'english', 'The United States Of America', 'US', '{celtic,eclectic,"new york city",npr,"public radio"}'::text[],
  '128'::int, 'MP3', '0.02511'::float8,
  true, 'approved', 't'::bool,
  'WFUV 90.7 Fordham University - New York, NY', NULL, NULL, NULL,
  '2026-04-15 20:57:01.208145+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  'bae70c5c-9f3f-42fc-a83d-6c13920590e0', 'Kiosk Radio', 'https://kioskradiobxl.out.airtime.pro/kioskradiobxl_b', 'https://kioskradio.com/', 'https://stostgutstaging197018.blob.core.windows.net/media/stations/70ee4806-a422-415c-8291-347eda44e651/9b043ad1-68fe-44db-9ec6-83256db50295/384.png',
  '{World}'::text[], 'english', 'Belgium', 'BE', '{independent,music,variety,"dj sets",electro}'::text[],
  '192'::int, 'AAC', '0.023119999999999998'::float8,
  true, 'approved', 't'::bool,
  'Kiosk Radio', NULL, NULL, NULL,
  '2026-04-16 13:07:04.90153+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  'd1a54d2e-623e-4970-ab11-35f7b56c5ec3', 'Classic Vinyl HD', 'https://icecast.walmradio.com:8443/classic', 'https://walmradio.com/classic', 'https://icecast.walmradio.com:8443/classic.jpg',
  '{Jazz}'::text[], 'english', 'The United States Of America', 'US', '{1930,1940,1950,1960,"beautiful music","big band","classic hits",crooners,easy,"easy listening",hd,jazz,"light orchestral",lounge,oldies,orchestral,otr,relaxation,strings,swing,unwind,walm}'::text[],
  '320'::int, 'MP3', '0.71617'::float8,
  true, 'pending', 'f'::bool,
  'Classic Vinyl HD', NULL, NULL, NULL,
  '2026-04-17 12:38:19.018098+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '960cf833-0601-11e8-ae97-52543be04c81', 'SomaFM Groove Salad', 'https://somafm.com/groovesalad256.pls', 'https://somafm.com/groovesalad/', 'https://stostgutstaging197018.blob.core.windows.net/media/stations/a01a31bc-a86a-49c7-9ba9-954d0aca1393/69a9d525-5e29-44fa-a835-bba43eba2354/512.png',
  '{ambient,downtempo,electronic}'::text[], 'English', 'California', 'CA', '{ambient,chillout,downtempo,groove,lounge,sleep,electronic}'::text[],
  '256'::int, 'MP3', '0.70261'::float8,
  true, 'approved', 't'::bool,
  'SomaFM Groove Salad', NULL, 'Groove Salad is one of the most iconic ambient and downtempo internet radio streams, curated by Rusty Hodge. It delivers a continuous flow of chilled electronic music designed for focus, relaxation, and atmospheric immersion.

It’s a cornerstone of early internet radio culture—minimal, consistent, and deeply mood-driven.', 'Groove Salad is a slow-moving, textural listening experience built around ambient, downtempo, and space music. Tracks blend seamlessly into one another, creating a soft, enveloping soundscape with no abrupt transitions.

There is no traditional hosting, no interruptions, and no pressure to engage—just a steady, calming stream that sits in the background or gently pulls you into a focused state.',
  '2026-04-17 21:07:50.5674+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '932eb148-e6f6-11e9-a96c-52543be04c81', 'FIP', 'http://icecast.radiofrance.fr/fip-hifi.aac', 'https://www.fip.fr/', 'https://stostgutstaging197018.blob.core.windows.net/media/stations/1f078819-cf42-4625-9fca-2eff163e1073/c6efcebb-1a78-41ce-b5cc-96aec8a2eefa/512.png',
  '{indie,jazz,electronic}'::text[], 'French', 'France', 'FR', '{aac,music,"public radio","radio france"}'::text[],
  '192'::int, 'AAC', '0.70585'::float8,
  true, 'approved', 't'::bool,
  'FIP', NULL, 'FIP is one of France’s most iconic radio stations, known for its effortlessly eclectic programming and refined musical taste. Operated by Radio France, FIP blends genres with a uniquely smooth flow—moving from jazz to electronic, world music to indie, without ever feeling abrupt.

What sets FIP apart is its human curation: minimal talk, no ads, and carefully sequenced tracks that create a continuous, immersive listening experience. It feels less like radio and more like a perfectly assembled soundtrack.', 'FIP delivers a genre-fluid, mood-driven journey through music. Expect deep cuts, unexpected transitions, and a balance between classic and contemporary sounds. The station is famous for its subtle transitions and calm, almost hypnotic pacing.

There are no loud interruptions, no aggressive hosting—just a quiet, confident editorial voice guiding the listener through a rich sonic landscape.',
  '2026-04-17 21:29:09.208551+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  '2ce23ee2-95c5-407d-9df8-54c3cdde2825', 'Adroit Jazz Underground HD Opus', 'https://icecast.walmradio.com:8443/jazz_opus', 'https://walmradio.com/jazz', 'https://icecast.walmradio.com:8443/jazz.jpg',
  '{jazz}'::text[], 'en', 'The United States Of America', 'US', '{avant-garde,bebop,"big band",bop,combos,contemporary,"contemporary jazz",cool,"cool jazz","free jazz",fusion,"hard bop",hd,mainstream,"mainstream jazz",modern,"modern big band",opus,post-bop,straight-ahead,walm,"west coast"}'::text[],
  '192'::int, 'OGG', '0.70117'::float8,
  true, 'pending', 'f'::bool,
  'Adroit Jazz Underground', NULL, NULL, NULL,
  '2026-04-17 21:29:44.695196+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;

INSERT INTO stations (
  external_id, name, stream_url, homepage, logo,
  genres, language, country, country_code, tags,
  bitrate, codec, reliability_score,
  is_active, status, featured,
  custom_name, custom_website, overview, editor_notes,
  last_editor_action_at, last_synced_at, updated_at
) VALUES (
  'manual:48a4b309-2752-4a16-9278-8ec1702dc0c1', 'KALX 90.7 FM', 'https://stream.kalx.berkeley.edu:8443/kalx.flac', '', 'https://stostgutstaging197018.blob.core.windows.net/media/stations/18d2e9ac-2188-444d-bd32-8a749c9a3925/dacc68b9-f0f8-4ae9-9084-357c3c60226a/512.png',
  '{eclectic}'::text[], 'English', 'California', 'CA', '{freeform,unpredictable,extraordinary,underground}'::text[],
  '320'::int, 'FLAC', '0.8'::float8,
  true, 'approved', 't'::bool,
  NULL, NULL, 'KALX 90.7 FM is the student and community-run radio station for the University of California, Berkeley, and has been a cornerstone of Bay Area culture since its founding as "Radio KAL" in 1962. Licensed in 1967, the station is powered by nearly 300 dedicated volunteers who produce "homespun" content without relying on automated satellite feeds. It is best known for its freeform programming philosophy, where DJs are encouraged to weave together diverse musical genres—ranging from underground punk to avant-garde jazz—within a single broadcast. In addition to its eclectic music, KALX provides robust public affairs coverage, local news, and live sports play-by-play for Cal Berkeley’s athletic teams. Over its long history, the station has interviewed global icons like the Dalai Lama and briefly served as the official broadcaster for the Oakland Athletics in 1978. Today, KALX remains a vital educational hub, housing a massive physical library of over 100,000 albums and fostering a unique, "unpredictable" listening experience for the Berkeley community and beyond.', 'A frequency that refuses format.
KALX 90.7 FM moves like a living archive of taste in motion — loose, unpredictable, and quietly intentional. Built inside the margins of academia but never constrained by it, the station drifts between jazz fragments, basement electronics, spoken word detours, and the occasional perfectly placed silence.',
  '2026-04-20 09:45:23.479712+00'::timestamptz, NOW(), NOW()
)
ON CONFLICT (external_id) DO UPDATE SET
  status                = EXCLUDED.status,
  featured              = EXCLUDED.featured,
  logo                  = EXCLUDED.logo,
  custom_name           = EXCLUDED.custom_name,
  custom_website        = EXCLUDED.custom_website,
  overview              = EXCLUDED.overview,
  editor_notes          = EXCLUDED.editor_notes,
  last_editor_action_at = EXCLUDED.last_editor_action_at,
  updated_at            = NOW()
WHERE stations.last_editor_action_at IS NULL
   OR stations.last_editor_action_at < EXCLUDED.last_editor_action_at;


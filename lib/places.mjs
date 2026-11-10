// 실제 장소 데이터 조회 (AI 추천 장소 검증용)
// - 국내: 카카오 로컬 API (KAKAO_REST_API_KEY)
// - 해외: Google Places API (New) (GOOGLE_MAPS_API_KEY)
// 키가 없으면 조회를 건너뛰고 AI 결과만 반환합니다.

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const TIMEOUT_MS = 6000;

export const placesStatus = { kakao: !!KAKAO_KEY, google: !!GOOGLE_KEY };

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function searchKakao(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?size=1&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  const p = data.documents?.[0];
  if (!p) return null;
  return {
    source: "kakao",
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    lat: Number(p.y),
    lng: Number(p.x),
    phone: p.phone || "",
    url: p.place_url,
  };
}

async function searchGoogle(query) {
  const data = await fetchJson("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "ko", maxResultCount: 1 }),
  });
  const p = data.places?.[0];
  if (!p) return null;
  return {
    source: "google",
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? 0,
    url: p.googleMapsUri,
  };
}

/** 장소 하나 조회. 국내는 카카오 우선, 해외(또는 카카오 실패)는 구글. 실패 시 null */
async function lookup(region, name, isKorea) {
  const query = `${region} ${name}`;
  const order = isKorea ? [KAKAO_KEY && searchKakao, GOOGLE_KEY && searchGoogle] : [GOOGLE_KEY && searchGoogle];
  for (const search of order.filter(Boolean)) {
    try {
      const hit = await search(query);
      if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return hit;
    } catch (err) {
      console.error("place lookup failed:", err.message);
    }
  }
  return null;
}

/** AI가 만든 지역 추천 결과에 실제 장소 정보(verified)를 붙여 반환 */
export async function enrichPlace(result) {
  const providerReady = result.isKorea ? KAKAO_KEY || GOOGLE_KEY : GOOGLE_KEY;
  if (!providerReady) return { ...result, mapEnabled: false };

  const lists = ["stays", "restaurants", "attractions"];
  const enriched = await Promise.all(
    lists.map((key) =>
      Promise.all(
        result[key].map(async (spot) => ({ ...spot, verified: await lookup(result.region, spot.name, result.isKorea) })),
      ),
    ),
  );
  const out = { ...result, mapEnabled: true };
  lists.forEach((key, i) => (out[key] = enriched[i]));
  return out;
}

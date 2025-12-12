require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
  res.json({ message: '맛집앱 서버가 작동 중입니다!', status: 'running' });
});

app.post('/api/parse-reel', async (req, res) => {
  try {
    const { caption } = req.body;
    if (!caption) return res.status(400).json({ success: false, error: '캡션을 입력해주세요' });
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `다음 인스타그램 릴스 캡션에서 음식점 이름, 주소, 음식 카테고리를 추출해줘. JSON 형식으로만 답변해줘.

카테고리는 다음 6개 중 하나: 한식, 일식, 중식, 양식, 아시안, 디저트

형식: { "name": "가게이름", "address": "전체주소", "category": "카테고리" }

캡션: ${caption}`
      }]
    });
    
    const jsonMatch = message.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      res.json({ success: true, data: { name: parsed.name, address: parsed.address, category: parsed.category || '한식' } });
    } else {
      throw new Error('파싱 실패');
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/save-place', async (req, res) => {
  try {
    const { name, address, category, shared_from, latitude, longitude } = req.body;
    if (!name || !address) return res.status(400).json({ success: false, error: '필수 정보 누락' });
    
    const { data, error } = await supabase.from('places').insert([{
      name, address, category, shared_from, latitude, longitude,
      user_id: '00000000-0000-0000-0000-000000000000'
    }]).select();
    
    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/places', async (req, res) => {
  try {
    const { data, error } = await supabase.from('places').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/places/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('places').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function tryKakaoGeocode(address) {
  const KAKAO_API_KEY = '1fd7b644e2bc999f88fe79931e19e618';
  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encoded}`, {
      headers: { 'Authorization': `KakaoAK ${KAKAO_API_KEY}` }
    });
    const data = await response.json();
    if (data.documents && data.documents.length > 0) {
      return { lat: parseFloat(data.documents[0].y), lng: parseFloat(data.documents[0].x) };
    }
  } catch (e) { console.log('카카오 에러:', e.message); }
  return null;
}

async function tryNominatimGeocode(address) {
  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`, {
      headers: { 'User-Agent': 'FoodMap App' }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) { console.log('Nominatim 에러:', e.message); }
  return null;
}

app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Address required' });
    
    console.log('좌표 변환:', address);
    
    const kakaoResult = await tryKakaoGeocode(address);
    if (kakaoResult) {
      console.log('카카오 성공:', kakaoResult);
      return res.json({ success: true, ...kakaoResult });
    }
    
    const nominatimResult = await tryNominatimGeocode(address);
    if (nominatimResult) {
      console.log('Nominatim 성공:', nominatimResult);
      return res.json({ success: true, ...nominatimResult });
    }
    
    return res.json({ success: false, error: 'Geocoding failed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log('서버 실행 중! 포트:', PORT);
  console.log('OpenStreetMap API 연결됨 (해외 주소 지원)');
});

// 필요한 패키지 불러오기
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CORS 설정 (Flutter 웹에서 접근 허용)
app.use(cors());

// Anthropic AI 클라이언트
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
// Supabase 클라이언트
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// JSON 데이터 받을 수 있게 설정
app.use(express.json());

// 서버 작동 테스트 엔드포인트
app.get('/', (req, res) => {
  res.json({ 
    message: '맛집앱 서버가 작동 중입니다! 🍽️',
    status: 'running'
  });
});

// 릴스 캡션 파싱 API (AI 연결됨!)
app.post('/api/parse-reel', async (req, res) => {
  try {
    const { caption } = req.body;
    
    if (!caption) {
      return res.status(400).json({
        success: false,
        error: '캡션을 입력해주세요'
      });
    }
    
    console.log('받은 캡션:', caption);
    
    // Claude AI로 캡션 파싱
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `다음 인스타그램 릴스 캡션에서 음식점 이름, 주소, 음식 카테고리를 추출해줘.
JSON 형식으로만 답변해줘. 다른 말은 하지 마.

카테고리는 다음 중 하나로 선택해:
한식, 일식, 중식, 양식, 베트남, 태국, 인도, 멕시코, 이탈리안, 프렌치, 
패스트푸드, 분식, 샌드위치, 해산물, 스테이크, 라멘, 카레, 비건, 샐러드,
베이커리, 디저트, 카페, 아이스크림, 버블티, 
이자카야, 펍, 와인바, 칵테일바,
삼겹살, 곱창, 치킨, 피자, 버거, 샤브샤브, 훠궈, 오마카세, 뷔페, 브런치, 기타

형식:
{
  "name": "가게이름",
  "address": "전체주소",
  "category": "카테고리"
}

캡션:
${caption}`
      }]
    });
    
    // AI 응답 파싱
    const aiResponse = message.content[0].text;
    console.log('AI 응답:', aiResponse);
    
    // JSON 파싱
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      res.json({
        success: true,
        data: {
          name: parsed.name,
          address: parsed.address,
          category: parsed.category || '기타'
        }
      });
    } else {
      throw new Error('AI 응답을 파싱할 수 없습니다');
    }
    
  } catch (error) {
    console.error('에러 발생:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 맛집 저장 API (Supabase 연결!)
app.post('/api/save-place', async (req, res) => {
  try {
    const { name, address, category, shared_from, memo, instagram_url, latitude, longitude } = req.body;
    
    if (!name || !address) {
      return res.status(400).json({
        success: false,
        error: '가게 이름과 주소는 필수입니다'
      });
    }
    
    console.log('저장할 맛집:', name, address, latitude, longitude, category);
    
    // Supabase에 저장
    const { data, error } = await supabase
      .from('places')
      .insert([
        {
          name,
          address,
          category: category || null,
          shared_from: shared_from || null,
          memo: memo || null,
          instagram_url: instagram_url || null,
          latitude: latitude || null,
          longitude: longitude || null,
          user_id: '00000000-0000-0000-0000-000000000000'
        }
      ])
      .select();
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      message: '맛집이 저장되었습니다!',
      data: data[0]
    });
    
  } catch (error) {
    console.error('저장 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 저장된 맛집 목록 조회 API
app.get('/api/places', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: data,
      count: data.length
    });
    
  } catch (error) {
    console.error('조회 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 맛집 삭제 API
app.delete('/api/places/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('places')
      .delete()
      .eq('id', id);
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      message: '맛집이 삭제되었습니다'
    });
    
  } catch (error) {
    console.error('삭제 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 카카오 좌표 변환 API
app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: '주소를 입력해주세요'
      });
    }
    
    console.log('좌표 변환 요청:', address);
    
    const query = encodeURIComponent(address);
    
    // 주소 검색
    let response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${query}`,
      {
        headers: {
          'Authorization': 'KakaoAK 1fd7b644e2bc999f88fe79931e19e618'
        }
      }
    );
    
    let data = await response.json();
    console.log('카카오 주소 검색 결과:', data.documents?.length || 0);
    
    if (data.documents && data.documents.length > 0) {
      return res.json({
        success: true,
        lat: parseFloat(data.documents[0].y),
        lng: parseFloat(data.documents[0].x)
      });
    }
    
    // 주소 검색 실패시 키워드 검색
    response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${query}`,
      {
        headers: {
          'Authorization': 'KakaoAK 1fd7b644e2bc999f88fe79931e19e618'
        }
      }
    );
    
    data = await response.json();
    console.log('카카오 키워드 검색 결과:', data.documents?.length || 0);
    
    if (data.documents && data.documents.length > 0) {
      return res.json({
        success: true,
        lat: parseFloat(data.documents[0].y),
        lng: parseFloat(data.documents[0].x)
      });
    }
    
    res.json({
      success: false,
      error: '좌표를 찾을 수 없습니다'
    });
    
  } catch (error) {
    console.error('좌표 변환 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 인스타그램 릴스 캡션 크롤링 API
app.post('/api/instagram-caption', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL을 입력해주세요'
      });
    }
    
    console.log('인스타그램 URL:', url);
    
    // 인스타그램 페이지 가져오기
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    const html = await response.text();
    
    // meta 태그에서 description 추출
    const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/) ||
                      html.match(/<meta name="description" content="([^"]*)"/);
    
    if (descMatch && descMatch[1]) {
      const caption = descMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'");
      
      console.log('추출된 캡션:', caption);
      
      return res.json({
        success: true,
        caption: caption
      });
    }
    
    res.json({
      success: false,
      error: '캡션을 찾을 수 없습니다'
    });
    
  } catch (error) {
    console.error('크롤링 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 서버 시작
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
  console.log(`📱 테스트: 브라우저에서 http://localhost:${PORT} 를 열어보세요`);
  console.log(`🤖 AI 기능이 활성화되었습니다!`);
  console.log(`💾 데이터베이스가 연결되었습니다!`);
  console.log(`🗺️ 카카오 지도 API 연결됨!`);
  console.log(`📸 인스타그램 크롤링 API 연결됨!`);
});
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
        content: `다음 인스타그램 릴스 캡션에서 음식점 이름과 주소를 추출해줘.
JSON 형식으로만 답변해줘. 다른 말은 하지 마.

형식:
{
  "name": "가게이름",
  "address": "전체주소"
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
          address: parsed.address
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
    const { name, address, category, shared_from, memo, instagram_url } = req.body;
    
    if (!name || !address) {
      return res.status(400).json({
        success: false,
        error: '가게 이름과 주소는 필수입니다'
      });
    }
    
    console.log('저장할 맛집:', name, address);
    
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

// 서버 시작
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
  console.log(`📱 테스트: 브라우저에서 http://localhost:${PORT} 를 열어보세요`);
  console.log(`🤖 AI 기능이 활성화되었습니다!`);
  console.log(`💾 데이터베이스가 연결되었습니다!`);
});
// AI 파싱 테스트 (Node.js용)
const http = require('http');

const data = JSON.stringify({
  caption: '홍대 맛집 🍕 도미노피자 서울 마포구 양화로 160'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/parse-reel',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('🔄 AI에게 캡션 분석 요청 중...\n');

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('✅ AI 파싱 결과:');
    console.log(JSON.stringify(JSON.parse(responseData), null, 2));
  });
});

req.on('error', (error) => {
  console.error('❌ 에러:', error.message);
});

req.write(data);
req.end();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// 설정
const lineConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

// 클라이언트 초기화
const client = new line.Client(lineConfig);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const app = express();

// Webhook 엔드포인트
app.post('/callback', line.middleware(lineConfig), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// 이벤트 핸들러
async function handleEvent(event) {
    if (event.type !== 'message') return Promise.resolve(null);

    if (event.message.type === 'text') {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: event.message.text
        });
    }

    if (event.message.type === 'image') {
        return handleImageMessage(event);
    }

    return Promise.resolve(null);
}

// 이미지 처리 함수 (Gemini API 활용)
async function handleImageMessage(event) {
    try {
        // 1. 이미지 다운로드
        const stream = await client.getMessageContent(event.message.id);
        const buffer = await streamToBuffer(stream);

        // 2. Gemini API 호출 준비 (Base64 변환)
        const imagePart = {
            inlineData: {
                data: buffer.toString("base64"),
                mimeType: "image/jpeg",
            },
        };

        const prompt = `이 이미지에 있는 모든 텍스트를 추출한 뒤, 분석 결과만 깔끔하게 알려줘. 전체 교정본은 포함하지 마.
          
          응답 형식은 아래를 엄격히 지켜줘:
          
          [추출된 원본 텍스트]
          (이미지에서 읽어낸 텍스트 전체)
          
          [오탈자 체크]
          - (틀린 단어) -> (맞는 단어)
          (없으면 "오탈자가 없습니다."라고 표시)
          
          [문법 및 표현 분석]
          - (어색하거나 틀린 문장) -> (수정된 명확한 문장)
          (이유: 왜 틀렸는지 또는 더 나은 표현인 이유를 짧게 설명)
          (없으면 "문법적으로 완벽합니다."라고 표시)`;

        // 3. Gemini API 호출
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        // 4. 결과 응답
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: text
        });

    } catch (error) {
        console.error('Error processing image with Gemini:', error);
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '이미지 분석 중 오류가 발생했습니다: ' + error.message
        });
    }
}

// Stream to Buffer
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

// 서버 실행
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`listening on ${port}`);
});

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

        const prompt = `이 이미지에 있는 모든 텍스트를 추출해줘. 
          그 다음, 추출된 텍스트에서 맞춤법이나 문법 오류가 있다면 수정해줘.
          응답 형식은 아래와 같이 해줘:
          
          [추출된 원본 텍스트]
          (내용)
          
          [맞춤법 및 문법 교정 결과]
          - (오류 부분) -> (수정된 부분)
          
          [전체 교정본]
          (내용)`;

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

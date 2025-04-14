// config.js
// 설정 값들을 한 곳에서 관리하기 위한 파일
const config = {
    // 티켓 URL
    ticketUrl: 'https://www.ticketlink.co.kr/product/55751',
    
    // 타임아웃 설정 (밀리초)
    timeout: {
      navigation: 30000,     // 페이지 이동 타임아웃
      element: 10000,        // 요소 대기 타임아웃
      qrLogin: 180000,       // QR 로그인 대기 최대 시간(3분)
      captcha: 120000,       // 보안문자 입력 대기 최대 시간(2분)
      retry: 500,            // 재시도 간격
    },
    
    // 재시도 설정
    retry: {
      maxAttempts: 10,       // 최대 재시도 횟수
      seatRefresh: 20,       // 좌석 새로고침 최대 횟수
    },
    
    // 사용자 설정
    userSettings: {
      targetDate: '2023-12-25', // 원하는 날짜 (YYYY-MM-DD 형식)
      seatPreference: 'front',  // 좌석 선호도 (front, middle, any)
    },
    
    // 로깅 설정
    logging: {
      enabled: true,         // 로깅 활성화 여부
      level: 'info',         // 로그 레벨 (debug, info, warn, error)
    }
  };
  
  module.exports = config;
  // modules/browser.js
  // 브라우저 설정 및 관리
  const puppeteer = require('puppeteer');
  const config = require('../config');
  const logger = require('../utils/logger');
  
  /**
   * 브라우저 인스턴스를 생성하고 설정하는 클래스
   */
  class BrowserManager {
    constructor() {
      this.browser = null;
      this.page = null;
    }
    
    /**
     * 브라우저 인스턴스 초기화 및 설정
     * @returns {Promise<{browser: Browser, page: Page}>} 브라우저와 페이지 객체
     */
    async initialize() {
      logger.info('브라우저 초기화 중...');
      
      // 브라우저 시작
      this.browser = await puppeteer.launch({
        headless: false,  // 사용자가 진행 상황을 볼 수 있도록 헤드리스 모드 비활성화
        defaultViewport: { width: 1366, height: 768 },  // 기본 뷰포트 설정
        args: [
          '--window-size=1366,768',
          '--disable-notifications',  // 알림 비활성화
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',  // 정보 표시줄 비활성화
          '--disable-dev-shm-usage',  // 공유 메모리 사용 비활성화 (안정성 향상)
          '--disable-accelerated-2d-canvas',  // 가속 2D 캔버스 비활성화
          '--disable-gpu',  // GPU 가속 비활성화
          '--disable-features=site-per-process',  // 프로세스 분리 비활성화
        ],
        ignoreHTTPSErrors: true,  // HTTPS 오류 무시
      });
      
      // 첫 번째 페이지 가져오기
      this.page = (await this.browser.pages())[0];
      
      // 페이지 설정
      await this._configurePageSettings();
      
      // 이벤트 리스너 설정
      await this._setupEventListeners();
      
      logger.info('브라우저 초기화 완료');
      
      return { browser: this.browser, page: this.page };
    }
    
    /**
     * 페이지 기본 설정 구성
     * @private
     */
    async _configurePageSettings() {
      // 타임아웃 설정
      this.page.setDefaultNavigationTimeout(config.timeout.navigation);
      this.page.setDefaultTimeout(config.timeout.element);
      
      // 사용자 에이전트 설정 (실제 브라우저처럼 보이게)
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
      
      // 리소스 타입 차단 (성능 향상)
      await this.page.setRequestInterception(true);
      this.page.on('request', (request) => {
        const resourceType = request.resourceType();
        // 이미지, 폰트, 스타일시트 등 불필요한 리소스 차단
        if (['image', 'font', 'media'].includes(resourceType)) {
          request.abort();  // 요청 차단
        } else {
          request.continue();  // 요청 계속
        }
      });
      
      // 뷰포트 설정
      await this.page.setViewport({ width: 1366, height: 768 });
      
      // 캐시 비활성화
      await this.page.setCacheEnabled(false);
    }
    
    /**
     * 페이지 이벤트 리스너 설정
     * @private
     */
    async _setupEventListeners() {
      // 콘솔 로그 리스닝
      this.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          logger.error(`브라우저 콘솔: ${msg.text()}`);
        } else {
          logger.debug(`브라우저 콘솔: ${msg.text()}`);
        }
      });
      
      // 다이얼로그 자동 처리 (alert, confirm, prompt)
      this.page.on('dialog', async (dialog) => {
        const message = dialog.message();
        logger.info(`다이얼로그 감지됨: ${message}`);
        
        // 좌석 이미 선택됨 메시지 감지
        if (message.includes('이미 선택된 좌석') || 
            message.includes('다른 사용자가 선택') || 
            message.includes('선택하실 수 없는 좌석') ||
            message.includes('sold out') || 
            message.includes('매진된 좌석')) {
          
          logger.warn('좌석 경쟁 감지: 다른 사용자가 이미 선택한 좌석');
          
          // 글로벌 변수 설정 - 좌석 경쟁 감지 신호
          global.seatCompetitionDetected = true;
          global.lastCompetitionTime = Date.now();
          
          // 다이얼로그 수락
          await dialog.accept();
          
          // 알림 전달
          if (this.page) {
            await this.page.evaluate(() => {
              // 경쟁 상황 알림 소리 (짧고 빠른 알림)
              const audio = new Audio('data:audio/wav;base64,UklGRmYEAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YUwEAACAgICAgICAgICAgICAgICAgICAgICAgICA4dClhXdtVEU2JBYCAAAAABEiN0ZdcYOUqb3U7/j///v06tu3oYptVj8sCQEBCS1AV2yEnbDB3PH///359OvauqaOcVk/LAkBAgotQVdthJ2wwdvw///8+fTr2rqmjnFZPywJAQIKLUFXbYSdsMHc8P///Pn069q6po5xWT8sCQECCi1BV22EnbDB3PD///z59OvauqaOcVk/LAkBAgotQVdthJ2wwdvw');
              audio.play();
            });
          }
          
          return;
        }
        
        // 기타 다이얼로그는 그냥 확인
        await dialog.accept();
      });
      
      // 페이지 오류 리스닝
      this.page.on('error', (err) => {
        logger.error(`페이지 오류: ${err.message}`);
      });
      
      // 페이지 응답 리스닝 (필요 시 주석 해제)
      /*
      this.page.on('response', (response) => {
        const status = response.status();
        if (status >= 400) {
          logger.warn(`응답 오류 감지: ${response.url()} (${status})`);
        }
      });
      */
    }
    
    /**
     * 브라우저 및 리소스 정리
     */
    async cleanup() {
      if (this.browser) {
        logger.info('브라우저 종료 중...');
        await this.browser.close();
        this.browser = null;
        this.page = null;
        logger.info('브라우저 종료 완료');
      }
    }
  }
  
  module.exports = BrowserManager;
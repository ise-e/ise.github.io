  // index.js
  // 메인 진입점 파일
  const puppeteer = require('puppeteer');
  const config = require('./config');
  const logger = require('./utils/logger');
  const helpers = require('./utils/helpers');
  
  // 모듈 가져오기
  const BrowserManager = require('./modules/browser');
  const LoginManager = require('./modules/login');
  const DateSelectionManager = require('./modules/dateSelection');
  const CaptchaManager = require('./modules/captcha');
  const SeatSelectionManager = require('./modules/seatSelection');
  
  /**
   * 티켓링크 티켓팅 매크로 메인 클래스
   */
  class TicketingMacro {
    constructor() {
      this.browserManager = new BrowserManager();
      
      // 전역 변수 초기화
      global.seatCompetitionDetected = false;
      global.lastCompetitionTime = 0;
    }
    
    /**
     * 매크로 실행
     */
    async run() {
      try {
        logger.info('티켓팅 매크로 시작');
        
        // 브라우저 초기화
        const { browser, page } = await this.browserManager.initialize();
        this.browser = browser;
        this.page = page;
        
        // 로그인 프로세스
        const loginManager = new LoginManager(this.page);
        const loginSuccess = await loginManager.login();
        
        if (!loginSuccess) {
          throw new Error('로그인에 실패했습니다.');
        }
        
        // 날짜 선택 프로세스
        const dateManager = new DateSelectionManager(this.page);
        const dateSuccess = await dateManager.selectDate();
        
        if (!dateSuccess) {
          throw new Error('날짜 선택에 실패했습니다.');
        }
        
        // 예매하기 버튼 클릭
        const bookingSuccess = await dateManager.clickBookingButton();
        
        if (!bookingSuccess) {
          throw new Error('예매하기 버튼 클릭에 실패했습니다.');
        }
        
        // 보안문자(CAPTCHA) 처리
        const captchaManager = new CaptchaManager(this.page);
        const captchaSuccess = await captchaManager.handleCaptcha();
        
        if (!captchaSuccess) {
          throw new Error('보안문자 처리에 실패했습니다.');
        }
        
        // 좌석 선택 프로세스
        const seatManager = new SeatSelectionManager(this.page);
        const seatSuccess = await seatManager.selectSeat();
        
        if (!seatSuccess) {
          throw new Error('좌석 선택에 실패했습니다.');
        }
        
        // 성공 알림
        logger.info('티켓팅 매크로 성공');
        await helpers.notifyUser(this.page, '티켓팅이 성공했습니다! 결제를 진행해주세요.', 'info');
        
        // 알림창 표시
        await this.page.evaluate(() => {
          alert('티켓팅 성공! 결제를 진행해주세요.');
        });
        
      } catch (error) {
        logger.error(`매크로 실행 오류: ${error.message}`);
        
        if (this.page) {
          await helpers.notifyUser(this.page, `오류 발생: ${error.message}`, 'error');
        }
      } finally {
        // 브라우저는 수동으로 닫아야 결제 진행 가능
        logger.info('매크로 실행 완료. 결제를 위해 브라우저는 유지됩니다.');
      }
    }
    
    /**
     * 리소스 정리
     */
    async cleanup() {
      if (this.browserManager) {
        await this.browserManager.cleanup();
      }
    }
  }
  
  // 매크로 실행
  (async () => {
    const macro = new TicketingMacro();
    
    try {
      await macro.run();
    } catch (error) {
      console.error('치명적인 오류 발생:', error);
    }
  })();
  
  // 프로세스 종료 시 리소스 정리
  process.on('SIGINT', async () => {
    console.log('프로그램 종료 중...');
    if (global.macro) {
      await global.macro.cleanup();
    }
    process.exit();
  });
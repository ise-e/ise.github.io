  // modules/login.js
  // 로그인 관련 기능
  const config = require('../config');
  const logger = require('../utils/logger');
  const helpers = require('../utils/helpers');
  
  /**
   * 로그인 프로세스를 관리하는 클래스
   */
  class LoginManager {
    /**
     * @param {Page} page Puppeteer 페이지 객체
     */
    constructor(page) {
      this.page = page;
    }
    
    /**
     * 로그인 프로세스 실행
     * @returns {Promise<boolean>} 로그인 성공 여부
     */
    async login() {
      try {
        logger.info('로그인 프로세스 시작');
        
        // 티켓 URL로 이동
        await this.page.goto(config.ticketUrl, { waitUntil: 'networkidle2' });
        logger.info('티켓 페이지 로드 완료');
        
        // 로그인 버튼 찾아 클릭
        const loginButtonSelector = 'a.login_btn';
        await this.page.waitForSelector(loginButtonSelector, { visible: true });
        
        // 자연스러운 클릭을 위한 지연
        await this.page.waitForTimeout(helpers.getRandomDelay());
        
        await this.page.click(loginButtonSelector);
        logger.info('로그인 버튼 클릭됨');
        
        // PAYCO 앱 로그인 버튼 찾기
        const paycoLoginSelector = 'a.btn_payco_login, button.btn_payco_login';
        await this.page.waitForSelector(paycoLoginSelector, { visible: true });
        
        // 자연스러운 클릭을 위한 지연
        await this.page.waitForTimeout(helpers.getRandomDelay());
        
        await this.page.click(paycoLoginSelector);
        logger.info('PAYCO 앱 로그인 버튼 클릭됨');
        
        // QR 코드 표시 대기
        const qrCodeSelector = 'div.qr_box img, div.qrcode img';
        await this.page.waitForSelector(qrCodeSelector, { visible: true });
        
        // 사용자에게 QR 코드를 스캔하라고 알림
        await helpers.notifyUser(this.page, 'QR 코드를 PAYCO 앱으로 스캔해주세요. 인증이 완료되면 자동으로 다음 단계로 진행됩니다.', 'info');
        
        // QR 로그인 완료 감지
        await this._waitForQRLoginComplete();
        
        logger.info('로그인 성공');
        return true;
      } catch (error) {
        logger.error(`로그인 프로세스 오류: ${error.message}`);
        await helpers.notifyUser(this.page, '로그인 과정에서 오류가 발생했습니다.', 'error');
        return false;
      }
    }
    
    /**
     * QR 코드 인증 완료 대기
     * @private
     * @returns {Promise<void>}
     */
    async _waitForQRLoginComplete() {
      logger.info('QR 코드 인증 대기 중...');
      
      // 최대 대기 시간 설정
      const maxWaitTime = config.timeout.qrLogin;
      const startTime = Date.now();
      
      return new Promise(async (resolve, reject) => {
        let loginDetected = false;
        
        // 로그인 감지 함수
        const checkLoginStatus = async () => {
          try {
            // 현재 URL 확인
            const currentUrl = this.page.url();
            
            // 로그인 성공 여부 확인 (URL 변경 또는 특정 요소 존재 여부로 판단)
            // 현재 URL이 티켓 URL로 돌아왔거나 로그인 성공 후 표시되는 요소가 있는지 확인
            const isLoggedIn = currentUrl.includes('ticketlink.co.kr/product') &&
                              !currentUrl.includes('login');
            
            // 또는 로그인 성공 후 표시되는 특정 요소가 있는지 확인 (예: 유저 아이콘)
            const userIconExists = await helpers.elementExists(this.page, 'a.mypage_btn, a.user_btn', 100);
            
            if (isLoggedIn || userIconExists) {
              loginDetected = true;
              logger.info('QR 코드 인증 완료 감지');
              await helpers.notifyUser(this.page, 'QR 코드 인증이 완료되었습니다.', 'info');
              
              // 페이지 로딩 대기
              await this.page.waitForTimeout(1000);
              
              resolve();
              return true;
            }
            
            // 타임아웃 확인
            if (Date.now() - startTime > maxWaitTime) {
              logger.warn('QR 코드 인증 타임아웃');
              reject(new Error('QR 코드 인증 시간이 초과되었습니다.'));
              return true;
            }
            
            return false;
          } catch (error) {
            logger.error(`QR 인증 상태 확인 오류: ${error.message}`);
            return false;
          }
        };
        
        // 주기적으로 로그인 상태 확인
        const checkInterval = setInterval(async () => {
          const completed = await checkLoginStatus();
          
          if (completed || loginDetected) {
            clearInterval(checkInterval);
          }
        }, 1000);
        
        // 한 번 먼저 실행
        await checkLoginStatus();
      });
    }
  }
  
  module.exports = LoginManager;
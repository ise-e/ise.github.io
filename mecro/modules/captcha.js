  // modules/captcha.js
  // 보안문자(CAPTCHA) 처리 기능
  const config = require('../config');
  const logger = require('../utils/logger');
  const helpers = require('../utils/helpers');
  
  /**
   * 보안문자(CAPTCHA) 처리를 관리하는 클래스
   */
  class CaptchaManager {
    /**
     * @param {Page} page Puppeteer 페이지 객체
     */
    constructor(page) {
      this.page = page;
    }
    
    /**
     * 보안문자 처리 프로세스 실행
     * @returns {Promise<boolean>} 보안문자 처리 성공 여부
     */
    async handleCaptcha() {
      try {
        logger.info('보안문자 감지 및 처리 시작');
        
        // 보안문자 감지
        const captchaExists = await this._detectCaptcha();
        
        if (!captchaExists) {
          logger.info('보안문자가 감지되지 않음');
          return true; // 보안문자가 없으면 성공으로 간주
        }
        
        // 사용자에게 보안문자 입력 요청
        await helpers.notifyUser(this.page, '보안문자가 감지되었습니다. 직접 입력해주세요.', 'warn');
        
        // 사용자가 입력할 시간을 주기 위해 대기
        // 소리로 알림
        await this.page.evaluate(() => {
          // 알림 소리 재생
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBhxQsu/srlwEARtWwPP/4qprGwgHMeD///LThC4LBirV/P/t3pE5DAQO1vH78biCNAsDDPL///Tgqm09AgQX6O3x0cB8LgkCEPL//u7Oq2tNBAUL1+fs1rnFj0UB/wi/2NfAf38+AQAJ0ef15bul');
          audio.play();
        });
        
        // 보안문자 입력 대기
        const captchaCompleted = await this._waitForCaptchaInput();
        
        if (captchaCompleted) {
          logger.info('보안문자 입력 완료');
          return true;
        } else {
          throw new Error('보안문자 입력 타임아웃 또는 실패');
        }
      } catch (error) {
        logger.error(`보안문자 처리 오류: ${error.message}`);
        await helpers.notifyUser(this.page, '보안문자 처리 중 오류가 발생했습니다.', 'error');
        return false;
      }
    }
    
    /**
     * 보안문자 존재 여부 감지
     * @returns {Promise<boolean>} 보안문자 존재 여부
     * @private
     */
    async _detectCaptcha() {
      try {
        // 보안문자 관련 요소 선택자들
        const captchaSelectors = [
          'div.captcha_area',
          'div.security_code',
          'img.captcha_image',
          'input[name="captcha"]',
          'div.captcha_wrap',
          '#captchaImg',
          'div.security_char'
        ];
        
        // 각 선택자에 대해 존재 여부 확인
        for (const selector of captchaSelectors) {
          const exists = await helpers.elementExists(this.page, selector, 1000);
          
          if (exists) {
            logger.info(`보안문자 감지됨 (선택자: ${selector})`);
            return true;
          }
        }
        
        // 페이지 내용에 특정 텍스트가 있는지 확인
        const captchaTextExists = await this.page.evaluate(() => {
          const bodyText = document.body.innerText;
          return bodyText.includes('보안문자') ||
                 bodyText.includes('자동입력 방지') ||
                 bodyText.includes('CAPTCHA') ||
                 bodyText.includes('보안 코드');
        });
        
        if (captchaTextExists) {
          logger.info('보안문자 관련 텍스트 감지됨');
          return true;
        }
        
        return false;
      } catch (error) {
        logger.error(`보안문자 감지 오류: ${error.message}`);
        return false;
      }
    }
    
    /**
     * 보안문자 입력 완료 대기
     * @returns {Promise<boolean>} 입력 완료 여부
     * @private
     */
    async _waitForCaptchaInput() {
      logger.info('보안문자 입력 대기 중...');
      
      // 최대 대기 시간 설정
      const maxWaitTime = config.timeout.captcha;
      const startTime = Date.now();
      
      return new Promise(async (resolve, reject) => {
        // 완료 버튼 선택자들
        const completeButtonSelectors = [
          'button.btn_complete',
          'button.btn_confirm',
          'button.btn_ok',
          'button.submit',
          'button[type="submit"]',
          'input[type="submit"]'
        ];
        
        // 주기적으로 완료 버튼 상태 확인
        const checkInterval = setInterval(async () => {
          try {
            // 현재 타임아웃 여부 확인
            if (Date.now() - startTime > maxWaitTime) {
              clearInterval(checkInterval);
              logger.warn('보안문자 입력 타임아웃');
              reject(new Error('보안문자 입력 시간이 초과되었습니다.'));
              return;
            }
            
            // 완료 버튼이 존재하는지 확인
            for (const selector of completeButtonSelectors) {
              const buttonExists = await helpers.elementExists(this.page, selector, 100);
              
              if (buttonExists) {
                // 버튼 활성화 상태 확인
                const isButtonEnabled = await this.page.evaluate((sel) => {
                  const button = document.querySelector(sel);
                  return button && !button.disabled && !button.classList.contains('disabled');
                }, selector);
                
                if (isButtonEnabled) {
                  logger.info(`보안문자 입력 완료 버튼 발견: ${selector}`);
                  
                  // 자연스러운 클릭을 위한 지연
                  await this.page.waitForTimeout(helpers.getRandomDelay());
                  
                  // 버튼 클릭
                  await this.page.click(selector);
                  
                  // 다음 페이지 이동 또는 상태 변경 대기
                  await this.page.waitForTimeout(2000);
                  
                  clearInterval(checkInterval);
                  resolve(true);
                  return;
                }
              }
            }
          } catch (error) {
            logger.error(`보안문자 입력 확인 오류: ${error.message}`);
          }
        }, 1000);
      });
    }
  }
  
  module.exports = CaptchaManager;
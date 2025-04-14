  // utils/helpers.js
  // 유틸리티 함수들
  const helpers = {
    /**
     * 랜덤 지연 시간을 생성하는 함수 (봇 감지 방지)
     * @param {number} min 최소 지연 시간 (밀리초)
     * @param {number} max 최대 지연 시간 (밀리초)
     * @returns {number} 랜덤 지연 시간
     */
    getRandomDelay: (min = 100, max = 300) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    /**
     * 사용자에게 알림을 표시하는 함수
     * @param {Page} page Puppeteer 페이지 객체
     * @param {string} message 알림 메시지
     * @param {string} type 알림 유형 (info, warn, error)
     */
    notifyUser: async (page, message, type = 'info') => {
      console.log(`[알림-${type}] ${message}`);
      
      // 브라우저에 알림 표시
      await page.evaluate((msg, alertType) => {
        // 알림 스타일 설정
        const styles = {
          info: 'background-color: #d4edda; color: #155724; border-color: #c3e6cb;',
          warn: 'background-color: #fff3cd; color: #856404; border-color: #ffeeba;',
          error: 'background-color: #f8d7da; color: #721c24; border-color: #f5c6cb;'
        };
        
        // 기존 알림 요소가 있으면 제거
        const existingAlert = document.getElementById('ticketing-macro-alert');
        if (existingAlert) {
          existingAlert.remove();
        }
        
        // 새 알림 요소 생성
        const alertDiv = document.createElement('div');
        alertDiv.id = 'ticketing-macro-alert';
        alertDiv.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 15px;
          border-radius: 5px;
          z-index: 9999;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          font-family: Arial, sans-serif;
          max-width: 300px;
          ${styles[alertType]}
        `;
        alertDiv.textContent = msg;
        
        // 알림 추가
        document.body.appendChild(alertDiv);
        
        // 5초 후 알림 자동 제거
        setTimeout(() => {
          alertDiv.style.opacity = '0';
          alertDiv.style.transition = 'opacity 0.5s';
          setTimeout(() => alertDiv.remove(), 500);
        }, 5000);
        
        // 알림 소리 재생 (선택적)
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBhxQsu/srlwEARtWwPP/4qprGwgHMeD///LThC4LBirV/P/t3pE5DAQO1vH78biCNAsDDPL///Tgqm09AgQX6O3x0cB8LgkCEPL//u7Oq2tNBAUL1+fs1rnFj0UB/wi/2NfAf38+AQAJ0ef15bul\n');
        audio.play();
      }, message, type);
    },
    
    /**
     * 요소가 페이지에 존재하는지 확인하는 함수
     * @param {Page} page Puppeteer 페이지 객체
     * @param {string} selector 확인할 요소의 CSS 선택자
     * @param {number} timeout 타임아웃 (밀리초)
     * @returns {boolean} 요소 존재 여부
     */
    elementExists: async (page, selector, timeout = 1000) => {
      try {
        await page.waitForSelector(selector, { timeout });
        return true;
      } catch (error) {
        return false;
      }
    },
    
    /**
     * 사용자 입력을 대기하는 함수
     * @param {string} promptMessage 사용자에게 표시할 메시지
     * @returns {Promise<string>} 사용자 입력 값
     */
    waitForUserInput: (promptMessage) => {
      return new Promise((resolve) => {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        readline.question(`${promptMessage}: `, (input) => {
          readline.close();
          resolve(input);
        });
      });
    }
  };
  
  module.exports = helpers;
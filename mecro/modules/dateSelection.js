  // modules/dateSelection.js
  // 날짜 선택 관련 기능
  const config = require('../config');
  const logger = require('../utils/logger');
  const helpers = require('../utils/helpers');
  
  /**
   * 날짜 선택 프로세스를 관리하는 클래스
   */
  class DateSelectionManager {
    /**
     * @param {Page} page Puppeteer 페이지 객체
     */
    constructor(page) {
      this.page = page;
      this.targetDate = config.userSettings.targetDate;
    }
    
    /**
     * 날짜 선택 프로세스 실행
     * @returns {Promise<boolean>} 날짜 선택 성공 여부
     */
    async selectDate() {
      try {
        logger.info(`날짜 선택 프로세스 시작: ${this.targetDate}`);
        
        // 날짜 형식 검증
        if (!this._validateDateFormat(this.targetDate)) {
          throw new Error('날짜 형식이 잘못되었습니다. YYYY-MM-DD 형식이어야 합니다.');
        }
        
        // 날짜 컴포넌트 분리
        const [year, month, day] = this.targetDate.split('-').map(num => parseInt(num, 10));
        
        // 캘린더 UI가 로드될 때까지 대기
        const calendarSelector = 'div.calendar_container, div.calendar_wrap';
        await this.page.waitForSelector(calendarSelector, { visible: true });
        
        // 현재 표시된 연도와 월 확인
        const currentMonthYear = await this._getCurrentMonthYear();
        logger.debug(`현재 표시된 달력: ${currentMonthYear.year}년 ${currentMonthYear.month}월`);
        
        // 원하는 연도/월로 이동
        await this._navigateToYearMonth(year, month, currentMonthYear);
        
        // 해당 날짜 선택
        await this._selectDay(day);
        
        // 날짜 선택 확인
        const dateSelected = await this._verifyDateSelection();
        
        if (dateSelected) {
          logger.info(`날짜 선택 완료: ${this.targetDate}`);
          await helpers.notifyUser(this.page, `날짜가 선택되었습니다: ${this.targetDate}`, 'info');
          return true;
        } else {
          throw new Error('날짜 선택을 확인할 수 없습니다.');
        }
      } catch (error) {
        logger.error(`날짜 선택 프로세스 오류: ${error.message}`);
        await helpers.notifyUser(this.page, `날짜 선택 중 오류 발생: ${error.message}`, 'error');
        return false;
      }
    }
    
    /**
     * 날짜 형식 검증 (YYYY-MM-DD)
     * @param {string} dateString 검증할 날짜 문자열
     * @returns {boolean} 형식 유효성
     * @private
     */
    _validateDateFormat(dateString) {
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(dateString)) return false;
      
      const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
      
      // 월/일 범위 검증
      if (month < 1 || month > 12) return false;
      
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > lastDayOfMonth) return false;
      
      return true;
    }
    
    /**
     * 현재 표시된 연도와 월 가져오기
     * @returns {Promise<{year: number, month: number}>} 현재 연도와 월
     * @private
     */
    async _getCurrentMonthYear() {
      try {
        // 캘린더 헤더에서 현재 연도와 월 정보 추출
        const calendarHeader = await this.page.$('div.calendar_header, div.calendar_title');
        
        if (!calendarHeader) {
          throw new Error('캘린더 헤더를 찾을 수 없습니다.');
        }
        
        const headerText = await this.page.evaluate(el => el.textContent, calendarHeader);
        
        // 헤더 텍스트에서 연도와 월 추출 (형식: "2023년 12월" 또는 "2023.12")
        const yearMonthMatch = headerText.match(/(\d{4})[년.]\s*(\d{1,2})[월]?/);
        
        if (!yearMonthMatch) {
          // 다른 형식 시도
          const alternateMatch = headerText.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
          
          if (!alternateMatch) {
            throw new Error('캘린더 헤더에서 연도와 월 정보를 추출할 수 없습니다.');
          }
          
          return {
            year: parseInt(alternateMatch[1], 10),
            month: parseInt(alternateMatch[2], 10)
          };
        }
        
        return {
          year: parseInt(yearMonthMatch[1], 10),
          month: parseInt(yearMonthMatch[2], 10)
        };
      } catch (error) {
        logger.error(`현재 연도/월 확인 오류: ${error.message}`);
        throw error;
      }
    }
    
    /**
     * 원하는 연도와 월로 캘린더 이동
     * @param {number} targetYear 목표 연도
     * @param {number} targetMonth 목표 월
     * @param {{year: number, month: number}} currentMonthYear 현재 표시된 연도와 월
     * @private
     */
    async _navigateToYearMonth(targetYear, targetMonth, currentMonthYear) {
      try {
        let { year: currentYear, month: currentMonth } = currentMonthYear;
        
        // 이동 방향 및 횟수 계산
        const monthDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
        
        if (monthDiff === 0) {
          logger.debug('이미 원하는 연도/월이 표시되어 있습니다.');
          return;
        }
        
        logger.debug(`캘린더 이동 필요: ${monthDiff > 0 ? '다음' : '이전'} ${Math.abs(monthDiff)}개월`);
        
        // 이전/다음 월 버튼 선택자
        const prevMonthSelector = 'button.prev_month, a.prev_month, button.calendar_prev';
        const nextMonthSelector = 'button.next_month, a.next_month, button.calendar_next';
        
        // 이동 방향에 따라 이전/다음 버튼 클릭
        const buttonSelector = monthDiff > 0 ? nextMonthSelector : prevMonthSelector;
        const clickCount = Math.abs(monthDiff);
        
        for (let i = 0; i < clickCount; i++) {
          // 버튼이 존재하는지 확인
          const buttonExists = await helpers.elementExists(this.page, buttonSelector, 1000);
          
          if (!buttonExists) {
            throw new Error(`${monthDiff > 0 ? '다음' : '이전'} 월 버튼을 찾을 수 없습니다.`);
          }
          
          // 버튼 클릭
          await this.page.click(buttonSelector);
          
          // 변경 적용 대기
          await this.page.waitForTimeout(helpers.getRandomDelay(200, 400));
          
          // 진행 상황 로깅 (5개월마다)
          if ((i + 1) % 5 === 0 || i === clickCount - 1) {
            logger.debug(`캘린더 이동 중: ${i + 1}/${clickCount}`);
          }
        }
        
        // 최종 이동 결과 확인
        const finalMonthYear = await this._getCurrentMonthYear();
        
        if (finalMonthYear.year !== targetYear || finalMonthYear.month !== targetMonth) {
          throw new Error(`원하는 연도/월(${targetYear}년 ${targetMonth}월)로 이동하지 못했습니다. 현재: ${finalMonthYear.year}년 ${finalMonthYear.month}월`);
        }
        
        logger.info(`캘린더 이동 완료: ${targetYear}년 ${targetMonth}월`);
      } catch (error) {
        logger.error(`연도/월 이동 오류: ${error.message}`);
        throw error;
      }
    }
    
    /**
     * 특정 일자 선택
     * @param {number} day 선택할 일자
     * @private
     */
    async _selectDay(day) {
      try {
        // 날짜 셀 찾기
        const daySelector = 'td.calendar_cell, div.calendar_day';
        await this.page.waitForSelector(daySelector, { visible: true });
        
        // 선택 가능한 모든 날짜 셀 가져오기
        const dayCells = await this.page.$$('td.calendar_cell:not(.disabled):not(.none), div.calendar_day:not(.disabled):not(.none)');
        
        if (!dayCells || dayCells.length === 0) {
          throw new Error('선택 가능한 날짜가 없습니다.');
        }
        
        // 선택할 날짜 찾기
        let targetDayCell = null;
        
        for (const cell of dayCells) {
          const dayText = await this.page.evaluate(el => {
            // 날짜 텍스트 추출 (일반 텍스트 또는 특정 요소 내 텍스트)
            const dayElement = el.querySelector('.day, .num') || el;
            return dayElement.textContent.trim();
          }, cell);
          
          // 날짜만 추출 (숫자만)
          const dayNumber = parseInt(dayText.replace(/\D/g, ''), 10);
          
          if (dayNumber === day) {
            targetDayCell = cell;
            break;
          }
        }
        
        if (!targetDayCell) {
          throw new Error(`${day}일을 찾을 수 없거나 선택할 수 없습니다.`);
        }
        
        // 날짜 셀 클릭
        await targetDayCell.click();
        
        // 선택 효과 적용 대기
        await this.page.waitForTimeout(helpers.getRandomDelay());
        
        logger.info(`${day}일 선택됨`);
      } catch (error) {
        logger.error(`날짜 선택 오류: ${error.message}`);
        throw error;
      }
    }
    
    /**
     * 날짜 선택 완료 확인
     * @returns {Promise<boolean>} 날짜 선택 완료 여부
     * @private
     */
    async _verifyDateSelection() {
      try {
        // 날짜 선택 후 표시되는 요소 확인
        // 다음 단계 버튼 또는 선택된 날짜 표시 요소
        const selectionIndicator = 'button.btn_booking, button.btn_reservation, div.selected_date';
        
        const indicatorExists = await helpers.elementExists(this.page, selectionIndicator, 2000);
        
        if (!indicatorExists) {
          return false;
        }
        
        // 예매하기 버튼이 활성화되어 있는지 확인
        const bookingButton = await this.page.$('button.btn_booking, button.btn_reservation');
        
        if (!bookingButton) {
          return false;
        }
        
        const isDisabled = await this.page.evaluate(btn => {
          return btn.disabled || btn.classList.contains('disabled');
        }, bookingButton);
        
        return !isDisabled;
      } catch (error) {
        logger.error(`날짜 선택 확인 오류: ${error.message}`);
        return false;
      }
    }
    
    /**
     * 예매하기 버튼 클릭
     * @returns {Promise<boolean>} 클릭 성공 여부
     */
    async clickBookingButton() {
      try {
        // 예매하기 버튼 찾기
        const bookingButtonSelector = 'button.btn_booking, button.btn_reservation';
        await this.page.waitForSelector(bookingButtonSelector, { visible: true });
        
        // 버튼이 활성화 상태인지 확인
        const isButtonEnabled = await this.page.evaluate((selector) => {
          const button = document.querySelector(selector);
          return button && !button.disabled && !button.classList.contains('disabled');
        }, bookingButtonSelector);
        
        if (!isButtonEnabled) {
          throw new Error('예매하기 버튼이 비활성화 상태입니다.');
        }
        
        // 자연스러운 클릭을 위한 지연
        await this.page.waitForTimeout(helpers.getRandomDelay());
        
        // 버튼 클릭
        await this.page.click(bookingButtonSelector);
        
        // 다음 페이지 로딩 대기
        await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        logger.info('예매하기 버튼 클릭 성공');
        return true;
      } catch (error) {
        logger.error(`예매하기 버튼 클릭 오류: ${error.message}`);
        await helpers.notifyUser(this.page, '예매하기 버튼 클릭 중 오류가 발생했습니다.', 'error');
        return false;
      }
    }
  }
  
  module.exports = DateSelectionManager;
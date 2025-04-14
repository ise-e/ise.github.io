  // modules/seatSelection.js
  // 좌석 선택 관련 기능
  const config = require('../config');
  const logger = require('../utils/logger');
  const helpers = require('../utils/helpers');
  
  /**
   * 좌석 선택 프로세스를 관리하는 클래스
   */
  class SeatSelectionManager {
    /**
     * @param {Page} page Puppeteer 페이지 객체
     */
    constructor(page) {
      this.page = page;
      this.seatPreference = config.userSettings.seatPreference;
      this.retryCount = 0;
      this.maxRetries = config.retry.seatRefresh;
    }
    
    /**
     * 좌석 선택 프로세스 실행
     * @returns {Promise<boolean>} 좌석 선택 성공 여부
     */
    async selectSeat() {
      try {
        logger.info('좌석 선택 프로세스 시작');
        
        // 전역 변수 초기화
        global.seatCompetitionDetected = false;
        global.lastCompetitionTime = 0;
        
        // 좌석 선택 페이지 로딩 대기
        await this._waitForSeatPage();
        
        // 좌석 선택 시도
        while (this.retryCount < this.maxRetries) {
          // 좌석 경쟁 감지 플래그 초기화
          global.seatCompetitionDetected = false;
          
          logger.info(`좌석 선택 시도 (${this.retryCount + 1}/${this.maxRetries})`);
          
          // 선택 가능한 좌석 확인
          const availableSeats = await this._findAvailableSeats();
          
          if (availableSeats.length > 0) {
            // 선택 가능한 좌석이 있으면 선택
            const selectedSeat = await this._selectBestSeat(availableSeats);
            
            if (selectedSeat) {
              // 좌석 경쟁 감지 여부 확인 (다이얼로그 이벤트 처리 중 설정됨)
              if (global.seatCompetitionDetected) {
                logger.warn('좌석 경쟁 감지됨: 다른 좌석 선택 시도');
                
                // 경쟁이 감지되면 대기 시간 최소화 (빠른 재시도)
                await this.page.waitForTimeout(helpers.getRandomDelay(100, 200));
                continue; // 즉시 다음 반복으로 넘어가 새로운 좌석 선택
              }
              
              // 다음 단계 버튼 클릭
              const nextStepSuccess = await this._clickNextStep();
              
              // 다음 단계 진행 중 좌석 경쟁 감지 여부 확인
              if (global.seatCompetitionDetected) {
                logger.warn('다음 단계 진행 중 좌석 경쟁 감지됨: 다른 좌석 선택 시도');
                
                // 대기 시간 최소화하고 새로운 반복으로
                await this.page.waitForTimeout(helpers.getRandomDelay(100, 200));
                continue;
              }
              
              if (nextStepSuccess) {
                logger.info('좌석 선택 및 다음 단계 이동 성공');
                await helpers.notifyUser(this.page, '좌석 선택이 완료되었습니다!', 'info');
                return true;
              }
            }
          } else {
            // 좌석이 없으면 새로고침
            logger.info('선택 가능한 좌석이 없습니다. 새로고침을 시도합니다.');
            const refreshed = await this._refreshSeats();
            
            if (!refreshed) {
              throw new Error('좌석 새로고침에 실패했습니다.');
            }
          }
          
          this.retryCount++;
          
          // 일정 시간 대기 후 재시도 (좌석 경쟁 감지된 경우 대기 시간 단축)
          if (this.retryCount < this.maxRetries) {
            if (global.seatCompetitionDetected) {
              // 경쟁 감지된 경우 매우 짧은 대기
              await this.page.waitForTimeout(helpers.getRandomDelay(100, 300));
            } else {
              // 정상적인 경우 표준 대기
              await this.page.waitForTimeout(helpers.getRandomDelay(500, 1000));
            }
          }
        }
        
        throw new Error(`최대 ${this.maxRetries}회 시도 후에도 좌석을 선택할 수 없습니다.`);
      } catch (error) {
        logger.error(`좌석 선택 프로세스 오류: ${error.message}`);
        await helpers.notifyUser(this.page, '좌석 선택 중 오류가 발생했습니다.', 'error');
        return false;
      }
    }
    
    /**
     * 좌석 선택 페이지 로딩 대기
     * @private
     */
    async _waitForSeatPage() {
      try {
        logger.info('좌석 선택 페이지 로딩 대기');
        
        // 좌석 선택 페이지의 주요 요소 대기
        const seatPageSelectors = [
          'div.seat_area',
          'div.seatmap_wrap',
          'div.seat_map',
          '#seatLayout'
        ];
        
        let seatPageLoaded = false;
        
        for (const selector of seatPageSelectors) {
          const exists = await helpers.elementExists(this.page, selector, 5000);
          
          if (exists) {
            logger.info(`좌석 선택 페이지 로드됨 (선택자: ${selector})`);
            seatPageLoaded = true;
            break;
          }
        }
        
        if (!seatPageLoaded) {
          throw new Error('좌석 선택 페이지를 찾을 수 없습니다.');
        }
        
        // 추가 로딩 대기
        await this.page.waitForTimeout(1000);
        
      } catch (error) {
        logger.error(`좌석 페이지 로딩 오류: ${error.message}`);
        throw error;
      }
    }
    
    /**
     * 선택 가능한 좌석 찾기
     * @returns {Promise<Array>} 선택 가능한 좌석 배열
     * @private
     */
    async _findAvailableSeats() {
      try {
        // 선택 가능한 좌석 선택자들
        const availableSeatSelectors = [
          'div.seat:not(.disabled):not(.completed)',
          'a.seat:not(.disabled):not(.completed)',
          'div.seat_grp .seat:not(.disabled):not(.completed)',
          'div.seat_wrap .seat:not(.disabled):not(.completed)',
          'div.seat_area .seat.available',
          '.SeatSelector__seat--available'
        ];
        
        // 모든 선택자에 대해 시도
        for (const selector of availableSeatSelectors) {
          const seats = await this.page.$$(selector);
          
          if (seats.length > 0) {
            logger.info(`${seats.length}개의 사용 가능한 좌석 발견 (선택자: ${selector})`);
            return seats;
          }
        }
        
        // 선택자로 찾지 못한 경우 JavaScript로 찾기 시도
        const seatsFoundByJS = await this.page.evaluate(() => {
          // 일반적인 좌석 클래스나 속성 패턴 찾기
          const potentialSeats = Array.from(document.querySelectorAll('.seat, [data-seat], [class*="seat"], [id*="seat"]'));
          
          // 선택 가능한 좌석 필터링
          return potentialSeats.filter(seat => {
            const classes = seat.className || '';
            const style = window.getComputedStyle(seat);
            
            // 일반적인 비활성화 패턴 확인
            const isDisabled = classes.includes('disabled') || 
                              classes.includes('completed') || 
                              classes.includes('sold') || 
                              classes.includes('reserved') ||
                              seat.hasAttribute('disabled') ||
                              style.opacity === '0.5' ||
                              style.pointerEvents === 'none';
            
            // 선택 가능한 좌석 표시 확인
            const isSelectable = classes.includes('available') || 
                                classes.includes('selectable') ||
                                seat.getAttribute('data-status') === 'available';
            
            return !isDisabled && (isSelectable || true);
          }).map((seat, index) => {
            return {
              index,
              boundingBox: seat.getBoundingClientRect(),
              classes: seat.className,
              id: seat.id
            };
          });
        });
        
        if (seatsFoundByJS.length > 0) {
          logger.info(`JavaScript로 ${seatsFoundByJS.length}개의 사용 가능한 좌석 발견`);
          
          // 좌석 객체를 ElementHandle로 변환
          const seatHandles = [];
          for (const seat of seatsFoundByJS) {
            try {
              let selector;
              if (seat.id) {
                selector = `#${seat.id}`;
              } else if (seat.classes) {
                selector = `.${seat.classes.split(' ').join('.')}`;
              } else {
                // 좌표 기반 선택
                const elements = await this.page.evaluateHandle(coords => {
                  return document.elementFromPoint(
                    coords.x + coords.width / 2, 
                    coords.y + coords.height / 2
                  );
                }, seat.boundingBox);
                
                seatHandles.push(elements);
                continue;
              }
              
              const element = await this.page.$(selector);
              if (element) {
                seatHandles.push(element);
              }
            } catch (error) {
              logger.debug(`좌석 핸들 변환 오류 (좌석 #${seat.index}): ${error.message}`);
            }
          }
          
          return seatHandles;
        }
        
        logger.info('선택 가능한 좌석을 찾을 수 없습니다.');
        return [];
      } catch (error) {
        logger.error(`좌석 찾기 오류: ${error.message}`);
        return [];
      }
    }
    
    /**
     * 최적의 좌석 선택
     * @param {Array} availableSeats 선택 가능한 좌석 배열
     * @returns {Promise<boolean>} 선택 성공 여부
     * @private
     */
    async _selectBestSeat(availableSeats) {
      try {
        if (availableSeats.length === 0) {
          return false;
        }
        
        // 좌석 경쟁이 감지된 경우 이전에 선택된 것과 다른 좌석 선택 (랜덤으로 선택)
        let seatSelectionStrategy = this.seatPreference;
        
        // 최근 경쟁이 있었는지 확인 (3초 이내)
        const recentCompetition = global.lastCompetitionTime && 
                                 (Date.now() - global.lastCompetitionTime < 3000);
        
        if (recentCompetition) {
          logger.info('최근 좌석 경쟁 감지: 랜덤 좌석 선택 전략으로 전환');
          seatSelectionStrategy = 'random';
        }
        
        // 좌석 정보 수집 (위치 기반 정렬을 위해)
        const seatsWithPosition = await Promise.all(availableSeats.map(async (seat, index) => {
          try {
            // 좌석 위치 정보 가져오기
            const boundingBox = await seat.boundingBox();
            
            if (!boundingBox) {
              return null;
            }
            
            // 좌석 라벨/ID 가져오기 (있는 경우)
            const seatInfo = await this.page.evaluate(el => {
              return {
                id: el.id || '',
                text: el.textContent || '',
                classes: el.className || '',
                // 추가 정보 - 좌석 코드나 숨겨진 데이터 속성 수집
                seatCode: el.getAttribute('data-seat-code') || el.getAttribute('data-seat-id') || '',
                status: el.getAttribute('data-status') || ''
              };
            }, seat);
            
            return {
              index,
              seat,
              x: boundingBox.x + boundingBox.width / 2, // 중앙 X 좌표
              y: boundingBox.y + boundingBox.height / 2, // 중앙 Y 좌표
              info: seatInfo
            };
          } catch (error) {
            logger.debug(`좌석 정보 수집 오류 (인덱스 ${index}): ${error.message}`);
            return null;
          }
        }));
        
        // null 값 제거
        const validSeats = seatsWithPosition.filter(seat => seat !== null);
        
        if (validSeats.length === 0) {
          return false;
        }
        
        // 사용자 선호도 또는 경쟁 상황에 따라 좌석 정렬 및 선택
        let selectedSeat;
        
        switch (seatSelectionStrategy) {
          case 'front':
            // 앞쪽 선호 (Y 좌표가 작을수록 앞쪽)
            validSeats.sort((a, b) => a.y - b.y);
            selectedSeat = validSeats[0];
            break;
          
          case 'middle':
            // 중앙 선호 (스테이지 중앙에 가까울수록)
            // 페이지 중앙 X 좌표 계산
            const pageWidth = await this.page.evaluate(() => window.innerWidth);
            const centerX = pageWidth / 2;
            
            // 중앙에서의 거리 계산
            validSeats.forEach(seat => {
              seat.distanceFromCenter = Math.abs(seat.x - centerX);
            });
            
            // 중앙에 가까운 순서로 정렬
            validSeats.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
            selectedSeat = validSeats[0];
            break;
            
          case 'random':
            // 랜덤 선택 (좌석 경쟁 시)
            const randomIndex = Math.floor(Math.random() * validSeats.length);
            selectedSeat = validSeats[randomIndex];
            logger.info(`랜덤 좌석 선택: 총 ${validSeats.length}개 중 ${randomIndex+1}번째 좌석`);
            break;
          
          case 'any':
          default:
            // 기본: 첫 번째 사용 가능한 좌석 선택
            selectedSeat = validSeats[0];
            break;
        }
        
        // 좌석 경쟁 확인
        if (global.seatCompetitionDetected) {
          logger.warn('좌석 선택 전 경쟁 감지됨: 프로세스 중단하고 새 좌석 선택으로 진행');
          return false;
        }
        
        // 선택된 좌석 클릭
        logger.info(`좌석 선택: ${selectedSeat.info.id || selectedSeat.info.text || '좌석 #' + selectedSeat.index}`);
        
        // 자연스러운 클릭을 위한 지연 (경쟁 상황에서는 지연 최소화)
        if (recentCompetition) {
          await this.page.waitForTimeout(helpers.getRandomDelay(50, 100)); // 경쟁 시 매우 짧은 지연
        } else {
          await this.page.waitForTimeout(helpers.getRandomDelay(150, 250)); // 일반적인 지연 줄임
        }
        
        await selectedSeat.seat.click();
        
        // 좌석 경쟁 확인
        if (global.seatCompetitionDetected) {
          logger.warn('좌석 클릭 후 경쟁 감지됨: 프로세스 중단하고 새 좌석 선택으로 진행');
          return false;
        }
        
        // 선택 확인 대기 (경쟁 상황에서는 대기시간 줄임)
        if (recentCompetition) {
          await this.page.waitForTimeout(200); // 경쟁 시 짧은 대기
        } else {
          await this.page.waitForTimeout(400); // 일반적인 대기시간 줄임
        }
        
        // 선택 후 경쟁 상황 재확인
        if (global.seatCompetitionDetected) {
          logger.warn('선택 확인 중 경쟁 감지됨: 프로세스 중단하고 새 좌석 선택으로 진행');
          return false;
        }
        
        // 선택 상태 확인
        try {
          const isSelected = await this.page.evaluate(el => {
            return el.classList.contains('selected') || 
                  el.classList.contains('active') || 
                  el.getAttribute('data-selected') === 'true' ||
                  el.getAttribute('aria-selected') === 'true';
          }, selectedSeat.seat);
          
          if (!isSelected) {
            logger.warn('좌석이 선택되지 않았을 수 있습니다.');
            
            // 좌석이 선택되지 않은 경우 경쟁 상황으로 간주
            global.seatCompetitionDetected = true;
            global.lastCompetitionTime = Date.now();
            
            return false;
          }
        } catch (error) {
          logger.debug(`선택 상태 확인 오류: ${error.message}`);
          // 오류 발생 시 진행 시도
        }
        
        return true;
      } catch (error) {
        logger.error(`좌석 선택 오류: ${error.message}`);
        return false;
      }
    }
    
    /**
     * 좌석 새로고침
     * @returns {Promise<boolean>} 새로고침 성공 여부
     * @private
     */
    async _refreshSeats() {
      try {
        // 새로고침 버튼 선택자들
        const refreshButtonSelectors = [
          'button.btn_refresh',
          'a.refresh_btn',
          'button.refresh',
          'button[title="새로고침"]',
          'button.reload',
          'button.btn_reload'
        ];
        
        // 각 선택자에 대해 시도
        for (const selector of refreshButtonSelectors) {
          const buttonExists = await helpers.elementExists(this.page, selector, 500);
          
          if (buttonExists) {
            logger.info(`새로고침 버튼 발견: ${selector}`);
            
            // 자연스러운 클릭을 위한 지연
            await this.page.waitForTimeout(helpers.getRandomDelay());
            
            // 버튼 클릭
            await this.page.click(selector);
            
            // 새로고침 완료 대기
            await this.page.waitForTimeout(1000);
            
            return true;
          }
        }
        
        // 특정 선택자가 없는 경우 JavaScript 실행으로 새로고침 시도
        const refreshedByJS = await this.page.evaluate(() => {
          // 일반적인 새로고침 함수나 이벤트 시도
          if (typeof window.refreshSeats === 'function') {
            window.refreshSeats();
            return true;
          } else if (typeof window.reload === 'function') {
            window.reload();
            return true;
          } else {
            // 새로고침 버튼을 텍스트나 아이콘으로 찾기
            const refreshButtons = Array.from(document.querySelectorAll('button, a, div')).filter(el => {
              const text = el.textContent.toLowerCase();
              return text.includes('새로고침') || 
                    text.includes('refresh') || 
                    text.includes('reload') ||
                    el.querySelector('i.fa-refresh, i.fa-sync, i.fa-redo');
            });
            
            if (refreshButtons.length > 0) {
              refreshButtons[0].click();
              return true;
            }
            
            return false;
          }
        });
        
        if (refreshedByJS) {
          logger.info('JavaScript로 새로고침 실행');
          await this.page.waitForTimeout(1000);
          return true;
        }
        
        logger.warn('새로고침 버튼을 찾을 수 없습니다.');
        return false;
      } catch (error) {
        logger.error(`좌석 새로고침 오류: ${error.message}`);
        return false;
      }
    }
    
    /**
     * 다음 단계 버튼 클릭
     * @returns {Promise<boolean>} 클릭 성공 여부
     * @private
     */
    async _clickNextStep() {
      try {
        // 다음 단계 버튼 선택자들
        const nextButtonSelectors = [
          'button.btn_next',
          'button.btn_booking_next',
          'button.btn_step_next',
          'a.btn_next',
          'button.next',
          'button[title="다음 단계"]'
        ];
        
        // 각 선택자에 대해 시도
        for (const selector of nextButtonSelectors) {
          const buttonExists = await helpers.elementExists(this.page, selector, 1000);
          
          if (buttonExists) {
            logger.info(`다음 단계 버튼 발견: ${selector}`);
            
            // 버튼 활성화 상태 확인
            const isButtonEnabled = await this.page.evaluate((sel) => {
              const button = document.querySelector(sel);
              return button && !button.disabled && !button.classList.contains('disabled');
            }, selector);
            
            if (!isButtonEnabled) {
              logger.warn('다음 단계 버튼이 비활성화되어 있습니다.');
              continue;
            }
            
            // 자연스러운 클릭을 위한 지연
            await this.page.waitForTimeout(helpers.getRandomDelay(100, 200));
            
            // 버튼 클릭
            await this.page.click(selector);
            
            // 다음 페이지 로딩 대기
            await this.page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {
              // 일부 사이트에서는 새 페이지로 이동하지 않을 수 있음
              logger.debug('페이지 이동 없음');
            });
            
            // 추가 로딩 대기
            await this.page.waitForTimeout(1000);
            
            return true;
          }
        }
        
        // JavaScript로 다음 단계 버튼 찾기
        const nextButtonByJS = await this.page.evaluate(() => {
          // 일반적인 다음 버튼 텍스트 패턴으로 찾기
          const buttons = Array.from(document.querySelectorAll('button, a, div')).filter(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('다음') || 
                  text.includes('next') || 
                  text.includes('진행') ||
                  text.includes('결제');
          });
          
          if (buttons.length > 0) {
            // 활성화된 버튼만 필터링
            const activeButtons = buttons.filter(button => {
              return !button.disabled && !button.classList.contains('disabled');
            });
            
            if (activeButtons.length > 0) {
              // 첫 번째 활성화된 버튼 반환
              return {
                found: true,
                text: activeButtons[0].textContent.trim(),
                id: activeButtons[0].id,
                class: activeButtons[0].className
              };
            }
          }
          
          return { found: false };
        });
        
        if (nextButtonByJS.found) {
          logger.info(`JavaScript로 다음 단계 버튼 발견: ${nextButtonByJS.text}`);
          
          // 버튼 클릭
          let selector;
          
          if (nextButtonByJS.id) {
            selector = `#${nextButtonByJS.id}`;
          } else if (nextButtonByJS.class) {
            selector = `.${nextButtonByJS.class.split(' ').join('.')}`;
          } else {
            selector = `button:contains("${nextButtonByJS.text}")`;
          }
          
          await this.page.click(selector).catch(async () => {
            // 선택자로 클릭할 수 없는 경우 JS로 클릭
            await this.page.evaluate((btnText) => {
              const buttons = Array.from(document.querySelectorAll('button, a, div')).filter(el => {
                return el.textContent.trim() === btnText;
              });
              
              if (buttons.length > 0) {
                buttons[0].click();
              }
            }, nextButtonByJS.text);
          });
          
          // 다음 페이지 로딩 대기
          await this.page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {
            // 일부 사이트에서는 새 페이지로 이동하지 않을 수 있음
            logger.debug('페이지 이동 없음');
          });
          
          return true;
        }
        
        logger.warn('다음 단계 버튼을 찾을 수 없습니다.');
        return false;
      } catch (error) {
        logger.error(`다음 단계 버튼 클릭 오류: ${error.message}`);
        return false;
      }
    }
  }
  
  module.exports = SeatSelectionManager;
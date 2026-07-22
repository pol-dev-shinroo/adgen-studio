export const initialProductReview = [
  {
    id: 'kiki-multivit',
    name: '키키 멀티비타민 60정',
    status: 'ok',
    fields: [
      { label: '가격', options: ['29,900원 (정가 39,900원)', '27,900원 (구독가)'], note: null },
      { label: '프로모션', options: ['7월 한정 25% + 무료배송', '1+1 이벤트 (7/20~)', '첫 구매 5,000원 쿠폰'], note: null },
      { label: 'Key Message', options: ['하루 한 알, 피로는 짧게 활력은 길게'], note: '수정됨' },
    ],
  },
  {
    id: 'kiki-omega3',
    name: '키키 오메가3 90캡슐',
    status: 'changed',
    fields: [
      { label: '가격', options: ['34,900원'], note: 'API 값 32,900원 → 34,900원 변경됨', noteType: 'danger' },
      { label: '프로모션', options: ['여름맞이 15% 할인'], note: null },
      { label: 'Key Message', options: ['혈행 건강, 매일의 습관'], note: null },
    ],
  },
  {
    id: 'kikibeauty-collagen',
    name: '키키뷰티 콜라겐 젤리',
    status: 'pending',
    fields: [
      { label: '가격', options: ['19,900원'], note: null },
      { label: '프로모션', options: ['2+1 이벤트', '무료배송'], note: null },
      { label: 'Key Message', options: ['씹어먹는 저분자 콜라겐'], note: null },
    ],
  },
]

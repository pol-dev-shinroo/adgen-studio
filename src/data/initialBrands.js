export const initialMyBrands = [
  {
    name: '헬시키키',
    desc: '건강기능식품 · 제품 24개',
    color: '#5b5bd6',
    active: true,
    products: {
      '키키 멀티비타민 60정': {
        prices: ['29,900원 (정가 39,900원)', '27,900원 (구독가)'],
        promos: ['7월 한정 25% + 무료배송', '1+1 이벤트 (7/20~)', '첫 구매 5,000원 쿠폰'],
        messages: ['하루 한 알, 피로는 짧게 활력은 길게', '비타민 13종 올인원'],
      },
      '키키 오메가3 90캡슐': {
        prices: ['34,900원'],
        promos: ['여름맞이 15% 할인'],
        messages: ['혈행 건강, 매일의 습관'],
      },
    },
  },
  {
    name: '키키뷰티',
    desc: '이너뷰티 · 제품 11개',
    color: '#d6a15b',
    active: false,
    products: {
      '키키뷰티 콜라겐 젤리': {
        prices: ['19,900원'],
        promos: ['2+1 이벤트', '무료배송'],
        messages: ['씹어먹는 저분자 콜라겐'],
      },
    },
  },
]

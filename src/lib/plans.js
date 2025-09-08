// 10 fixed, hardcoded edit plans for image variations
// Each plan is an array of steps with op and params

const PLANS = [
  // Plan 1: Brightness and Contrast
  [
    { op: 'brightness', params: { value: 20 } },
    { op: 'contrast', params: { value: 10 } }
  ],
  // Plan 2: Saturation boost
  [
    { op: 'saturation', params: { value: 30 } }
  ],
  // Plan 3: Hue shift
  [
    { op: 'hue', param: { value: 45 } } // Note: probably 'params' not 'param'
  ],
  // Plan 4: Grayscale
  [
    { op: 'filter', params: { type: 'grayscale' } }
  ],
  // Plan 5: Sepia tone
  [
    { op: 'filter', params: { type: 'sepia' } }
  ],
  // Plan 6: Brightness decrease and saturation increase
//   [
//     { op: 'brightness', params: { value: -15 } },
//     { op: 'saturation', params: { value: 20 } }
//   ],
//   // Plan 7: Contrast increase
//   [
//     { op: 'contrast', params: { value: 25 } }
//   ],
//   // Plan 8: Tint with blue
//   [
//     { op: 'tint', params: { color: '#0000ff', strength: 20 } }
//   ],
//   // Plan 9: Rotate 90 degrees
//   [
//     { op: 'rotate', params: { degrees: 90 } }
//   ],
  // Plan 10: Google AI edit
//   [
//     { op: 'googleEdit', params: { prompt: 'Enhance colors and details' } }
//   ]
];

module.exports = { PLANS };
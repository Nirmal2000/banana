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
    { op: 'hue', params: { value: 45 } }
  ],
  // Plan 4: Grayscale
  [
    { op: 'filter', params: { type: 'grayscale' } }
  ],  
  // Plan 5: Google AI edit
  [
    { op: 'googleEdit', params: { prompt: 'Enhance colors and details' } }
  ]
];

module.exports = { PLANS };
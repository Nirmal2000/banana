const sharp = require('sharp');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');

const MODEL_NAME = process.env.GOOGLE_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

const llm = new ChatGoogleGenerativeAI({
  model: MODEL_NAME,
  temperature: 0,
});

async function toUserMessage(prompt, base64Data) {
  return {
    role: 'user',
    content: [
      { type: 'text', text: prompt || '' },
      base64Data ? { type: 'image_url', image_url: `data:image/jpeg;base64,${base64Data}` } : null,
    ].filter(Boolean),
  };
}

async function extractImageData(aiMessage) {
  const blocks = Array.isArray(aiMessage?.content) ? aiMessage.content : [];
  for (const b of blocks) {
    if (b && typeof b === 'object') {
      if (b.image_url && typeof b.image_url === 'string' && b.image_url.startsWith('data:image/')) {
        return b.image_url;
      }
      if (b.inline_data || b.inlineData) {
        const inline = b.inline_data || b.inlineData;
        if (inline.data) {
          return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`;
        }
      }
    }
  }
  return null;
}

async function applyStep(buffer, step) {
  const sharpImg = sharp(buffer);
  const { op, params } = step;

  try {
    switch (op) {
      case 'brightness':
        // value: -100 to 100
        // Sharp uses multiplier where 1 = no change, <1 = darker, >1 = brighter
        const brightnessFactor = Math.max(0.1, Math.min(3.0, (params.value + 100) / 100));
        return await sharpImg.modulate({ brightness: brightnessFactor }).jpeg().toBuffer();

      case 'contrast':
        // value: -100 to 100
        // Sharp doesn't have direct contrast, but we can use linear adjustment
        const contrastFactor = Math.max(0.1, Math.min(3.0, (params.value + 100) / 100));
        return await sharpImg.linear(contrastFactor, -(128 * contrastFactor) + 128).jpeg().toBuffer();

      case 'saturation':
        // value: -100 to 100
        const sat = Math.max(0, Math.min(2, (params.value + 100) / 100)); // 0 to 2
        return await sharpImg.modulate({ saturation: sat }).jpeg().toBuffer();

      case 'hue':
        // value: -180 to 180
        const hueDeg = params.value || 0;
        return await sharpImg.modulate({ hue: hueDeg }).jpeg().toBuffer();

      case 'filter':
        if (params.type === 'grayscale') {
          return await sharpImg.grayscale().jpeg().toBuffer();
        } else if (params.type === 'sepia') {
          // Create sepia effect by converting to grayscale and tinting
          return await sharpImg
            .grayscale()
            .tint({ r: 255, g: 240, b: 196 }) // sepia tone
            .jpeg()
            .toBuffer();
        }
        break;

      case 'tint':
        const tintColor = params.color || '#ffffff';
        const strength = (params.strength || 0) / 100; // Convert to 0-1 range
        
        // Parse hex color
        const r = parseInt(tintColor.substr(1, 2), 16);
        const g = parseInt(tintColor.substr(3, 2), 16);
        const b = parseInt(tintColor.substr(5, 2), 16);
        
        // Apply tint with strength
        if (strength > 0) {
          return await sharpImg
            .composite([{
              input: Buffer.from([r, g, b, Math.round(strength * 255)]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: 'overlay'
            }])
            .jpeg()
            .toBuffer();
        }
        return await sharpImg.jpeg().toBuffer();

      case 'rotate':
        const deg = params.degrees || 90;
        return await sharpImg.rotate(deg).jpeg().toBuffer();

      case 'googleEdit':
        // Convert buffer to base64
        const base64 = buffer.toString('base64');
        const messages = [await toUserMessage(params.prompt, base64)];
        const aiMessage = await llm.invoke(messages, { response_modalities: ['TEXT', 'IMAGE'] });
        const dataUrl = await extractImageData(aiMessage);
        if (!dataUrl) throw new Error('No image from model');
        // Convert dataUrl back to buffer
        const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!base64Match) throw new Error('Invalid data URL');
        return Buffer.from(base64Match[1], 'base64');

      default:
        return buffer; // no change
    }
  } catch (error) {
    console.error(`Error applying step ${op}:`, error);
    return buffer; // fallback
  }
}

module.exports = { applyStep };
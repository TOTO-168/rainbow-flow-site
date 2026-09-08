/**
 * 虹光流動・電子微塵・夢幻漩渦 (Iridescent Stardust & Dreamlike Vortex)
 * 完整 WebGL 渲染管線、薄膜干涉光學色散著色器、物理引力漩渦與海報導出
 */

// ============================================================================
// 1. GLSL 著色器源碼 (Vertex & Fragment Shaders)
// ============================================================================
const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  varying vec2 v_uv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec4 u_ripples_a[20];
  uniform vec4 u_ripples_b[20];
  uniform sampler2D u_text_texture;

  // 控制參數
  uniform int u_preset_from;     // 過渡來源風格
  uniform int u_preset_to;       // 過渡目標風格
  uniform float u_preset_mix;    // 0.0 ~ 1.0 絲滑過渡進度
  uniform float u_bg_weights[5]; // 背景底色混合權重 (0: 水墨, 1: 玄黑, 2: 紙白, 3: 黛藍, 4: 赤霞)
  uniform float u_flow_speed;    // 流速
  uniform float u_dispersion;    // 色散強度
  uniform float u_grain;         // 電子塵埃顆粒強度
  uniform float u_halftone_scale;// 半色調網點尺寸
  uniform float u_vortex_power;  // 漩渦扭曲力
  uniform float u_defocus;       // 虛焦柔霧度
  uniform float u_contrast;      // 對比度
  uniform vec3 u_custom_palette_a;
  uniform vec3 u_custom_palette_b;
  uniform vec3 u_custom_palette_c;
  uniform float u_custom_palette_enabled;

  #define PI 3.14159265359

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  vec3 customPalette(float t) {
    float segment = fract(t * 0.18) * 3.0;
    if (segment < 1.0) return mix(u_custom_palette_a, u_custom_palette_b, smoothstep(0.0, 1.0, segment));
    if (segment < 2.0) return mix(u_custom_palette_b, u_custom_palette_c, smoothstep(0.0, 1.0, segment - 1.0));
    return mix(u_custom_palette_c, u_custom_palette_a, smoothstep(0.0, 1.0, segment - 2.0));
  }

  vec3 spectralPalette(float t, int preset) {
    if (u_custom_palette_enabled > 0.5) return customPalette(t);
    if (preset == 0) {
      // 0: 溫潤珠光 - 保留經典珍珠母貝微光
      vec3 a = vec3(0.88, 0.85, 0.90);
      vec3 b = vec3(0.32, 0.30, 0.35);
      vec3 c = vec3(1.0, 1.0, 1.0);
      vec3 d = vec3(0.0, 0.33, 0.67);
      return a + b * cos(2.0 * PI * (c * t + d));
    } else if (preset == 1) {
      // 1: 方寸微塵 - 賽博霓虹、電氣青、青檸綠與矩陣藍
      vec3 a = vec3(0.40, 0.65, 0.75);
      vec3 b = vec3(0.70, 0.55, 0.65);
      vec3 c = vec3(1.4, 1.0, 1.2);
      vec3 d = vec3(0.12, 0.55, 0.88);
      vec3 col = a + b * cos(2.0 * PI * (c * t + d));
      col = mix(col, vec3(0.2, 1.0, 0.4), smoothstep(0.3, 0.5, fract(t * 2.2)) * 0.4);
      return col;
    } else if (preset == 2) {
      // 2: 流雲織素 - 高級香檳、紫丁香、蜜桃與薄荷絲光
      vec3 a = vec3(0.78, 0.72, 0.76);
      vec3 b = vec3(0.28, 0.30, 0.28);
      vec3 c = vec3(0.9, 1.1, 0.85);
      vec3 d = vec3(0.35, 0.15, 0.60);
      return a + b * cos(2.0 * PI * (c * t + d));
    } else if (preset == 3) {
      // 3: 浮光過隙 - 高飽和電光全息極光
      vec3 a = vec3(0.50, 0.50, 0.50);
      vec3 b = vec3(0.60, 0.60, 0.60);
      vec3 c = vec3(1.0, 1.0, 1.0);
      vec3 d = vec3(0.05, 0.38, 0.72);
      vec3 col = a + b * cos(2.0 * PI * (c * t + d));
      col = mix(col, vec3(0.0, 1.0, 0.88), smoothstep(0.20, 0.45, fract(t * 1.6)) * 0.5);
      col = mix(col, vec3(1.0, 0.15, 0.65), smoothstep(0.60, 0.85, fract(t * 1.6)) * 0.5);
      return col;
    } else {
      // 4: 晶透琉璃 - 琥珀流金、寶石翡翠、孔雀靛藍與紫晶琉璃
      vec3 a = vec3(0.66, 0.56, 0.64);
      vec3 b = vec3(0.46, 0.42, 0.48);
      vec3 c = vec3(1.15, 0.85, 1.05);
      vec3 d = vec3(0.16, 0.44, 0.82);
      vec3 col = a + b * cos(2.0 * PI * (c * t + d));
      col = mix(col, vec3(1.0, 0.80, 0.26), smoothstep(0.18, 0.38, fract(t * 1.5)) * 0.48);
      col = mix(col, vec3(0.10, 0.96, 0.78), smoothstep(0.52, 0.72, fract(t * 1.5)) * 0.42);
      col = mix(col, vec3(0.88, 0.32, 0.95), smoothstep(0.78, 0.98, fract(t * 1.5)) * 0.36);
      return col;
    }
  }

  float halftonePattern(vec2 p, float angle, float scale, float density) {
    float s = sin(angle);
    float c = cos(angle);
    vec2 rotP = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vec2 grid = fract(rotP * scale) - 0.5;
    float dist = length(grid);
    float radius = clamp(sqrt(density) * 0.65, 0.0, 0.5);
    return 1.0 - smoothstep(radius - 0.08, radius + 0.08, dist);
  }

  // ------------------------------------------------------------------------
  // 純粹單一尺寸電子微塵系統 (Uniform Single-Scale Electronic Stardust)
  // ------------------------------------------------------------------------
  vec3 electronicStardust(vec2 uv, float time, float densityMask) {
    // 嚴格採用單一均勻微粒尺寸 (Strictly Single Uniform Pixel Grain)
    // 閃爍速率放緩 15% (37.19 * 0.85 = 31.61)
    vec2 seed = floor(uv * u_resolution) + fract(time * 31.61);

    // RGB 亞像素微塵噪波 (全畫面統一尺寸)
    float nR = hash12(seed);
    float nG = hash12(seed + vec2(13.37, 7.19));
    float nB = hash12(seed + vec2(29.71, 31.43));
    vec3 subpixelNoise = (vec3(nR, nG, nB) - 0.5) * 0.85;

    // 晶瑩微光塵埃 (同一度量、同一尺寸的均一微粒，無大塊光斑)
    float spark = pow(nR, 20.0) * 3.0;
    vec3 sparkTint = vec3(
      hash12(seed * 1.3 + 2.0),
      hash12(seed * 2.5 + 5.0),
      hash12(seed * 3.7 + 8.0)
    );
    sparkTint = mix(vec3(1.0, 0.98, 0.95), sparkTint, 0.6);

    vec3 totalDust = (subpixelNoise * 0.9 + spark * sparkTint) * densityMask;
    return totalDust;
  }

  void evaluatePreset(
    int preset,
    vec2 twistedP,
    float t,
    float disp,
    out vec3 ribbonColor,
    out float ribbonCore,
    out float ribbonAura,
    out float darkVoid,
    out float spineX,
    out float flowCoord,
    out float htAngle,
    out float htScale
  ) {
    htScale = mix(65.0, 155.0, u_halftone_scale);
    htAngle = PI * 0.25;
    spineX = 0.0;
    float dx = 0.0;
    ribbonCore = 0.0;
    ribbonAura = 0.0;
    darkVoid = 0.0;
    flowCoord = 0.0;
    ribbonColor = vec3(0.0);

    if (preset == 0) {
      // 模式 0: 溫潤珠光 (Cyber Pearl) - 經典設計
      float wave1 = sin(twistedP.y * 2.2 + t * 0.6) * 0.28;
      float wave2 = sin(twistedP.y * 4.0 - t * 0.35) * 0.10;
      float gentleDrift = snoise(vec2(twistedP.y * 1.2, t * 0.2)) * 0.08;
      
      spineX = wave1 + wave2 + gentleDrift;
      dx = twistedP.x - spineX;
      float absDx = abs(dx);

      float widthMod = 0.22 + 0.10 * sin(twistedP.y * 2.5 + t * 0.4);
      float normDist = absDx / max(widthMod, 0.01);

      float coreSharpness = mix(14.0, 4.5, u_defocus);
      ribbonCore = exp(-normDist * normDist * coreSharpness);
      ribbonAura = exp(-normDist * 1.8) * 0.45;

      flowCoord = twistedP.y * 1.4 - dx * 2.2 + t * 0.5;

      vec3 colR = spectralPalette(flowCoord + disp, 0);
      vec3 colG = spectralPalette(flowCoord, 0);
      vec3 colB = spectralPalette(flowCoord - disp, 0);
      ribbonColor = vec3(colR.r, colG.g, colB.b);

      float specular = pow(clamp(1.0 - normDist * 1.8, 0.0, 1.0), 3.0);
      ribbonColor += vec3(0.95, 0.98, 1.0) * specular * 0.7;

      float shadowCenter = -0.12 * widthMod;
      float shadowDist = abs(dx - shadowCenter);
      float shadowWidth = widthMod * 1.7;
      darkVoid = exp(-pow(shadowDist / shadowWidth, 2.0) * 3.2);

      htAngle = PI * 0.25;

    } else if (preset == 1) {
      // 模式 1: 方寸微塵 (Digital Stream)
      float stepCount = 26.0;
      float quantY = floor(twistedP.y * stepCount) / stepCount;

      float glitchSeed = fract(sin(quantY * 127.1 + floor(u_time * 6.5) * 31.7) * 43758.5453);
      float glitchOffset = (glitchSeed > 0.84) ? (glitchSeed - 0.92) * 0.38 : 0.0;

      float digitalSpine = sin(quantY * 2.4 + t * 0.8) * 0.32 + glitchOffset;
      spineX = digitalSpine;
      dx = twistedP.x - digitalSpine;

      float blockWidth = 0.20 + 0.08 * sin(quantY * 3.5 + t * 0.5);
      float absDxDigital = abs(dx);

      float scanline = 0.85 + 0.15 * sin(twistedP.y * u_resolution.y * 0.4);

      float normDistDig = absDxDigital / max(blockWidth, 0.01);
      float coreSharpness = mix(22.0, 7.0, u_defocus);
      ribbonCore = exp(-normDistDig * normDistDig * coreSharpness) * scanline;
      ribbonAura = exp(-normDistDig * 1.5) * 0.4;

      vec2 blockCoord = vec2(floor(twistedP.x * 40.0) / 40.0, quantY);
      float blockNoise = hash12(blockCoord + floor(u_time * 4.0) * 0.1);
      if (blockNoise > 0.80 && ribbonAura > 0.06) {
        ribbonCore += 0.40;
      }

      flowCoord = quantY * 1.6 - dx * 3.0 + t * 0.7;
      vec3 colR = spectralPalette(flowCoord + disp * 1.4, 1);
      vec3 colG = spectralPalette(flowCoord, 1);
      vec3 colB = spectralPalette(flowCoord - disp * 1.4, 1);
      ribbonColor = vec3(colR.r, colG.g, colB.b);

      float digitalSpec = step(0.90, 1.0 - normDistDig);
      ribbonColor += vec3(0.3, 1.0, 0.9) * digitalSpec * 0.75;

      float shadowDist = abs(dx + 0.10 * blockWidth);
      darkVoid = exp(-pow(shadowDist / (blockWidth * 1.8), 2.0) * 3.2);

      htScale = mix(80.0, 180.0, u_halftone_scale);
      htAngle = 0.0;

    } else if (preset == 2) {
      // 模式 2: 流雲織素 (Interwoven Silk)
      float waveA = sin(twistedP.y * 2.6 + t * 0.65) * 0.25;
      float waveB = sin(twistedP.y * 2.6 - t * 0.65 + PI) * 0.25;
      float spine1 = waveA + snoise(vec2(twistedP.y * 1.5, t * 0.2)) * 0.05;
      float spine2 = waveB + snoise(vec2(twistedP.y * 1.5, t * 0.2 + 5.0)) * 0.05;

      float dx1 = twistedP.x - spine1;
      float dx2 = twistedP.x - spine2;
      float w1 = 0.16 + 0.06 * sin(twistedP.y * 3.0 + t * 0.5);
      float w2 = 0.16 + 0.06 * cos(twistedP.y * 3.0 - t * 0.5);

      float norm1 = abs(dx1) / max(w1, 0.01);
      float norm2 = abs(dx2) / max(w2, 0.01);

      float coreSharp = mix(14.0, 5.0, u_defocus);
      float core1 = exp(-pow(dx1 / max(w1, 0.01), 2.0) * coreSharp);
      float core2 = exp(-pow(dx2 / max(w2, 0.01), 2.0) * coreSharp);
      float aura1 = exp(-abs(dx1) / max(w1, 0.01) * 1.8) * 0.4;
      float aura2 = exp(-abs(dx2) / max(w2, 0.01) * 1.8) * 0.4;

      float fold1 = 0.5 + 0.5 * sin(twistedP.y * 16.0 - dx1 * 8.0 + t * 1.2);
      float fold2 = 0.5 + 0.5 * sin(twistedP.y * 16.0 + dx2 * 8.0 - t * 1.2);
      core1 *= (0.85 + fold1 * 0.3);
      core2 *= (0.85 + fold2 * 0.3);

      ribbonCore = max(core1, core2);
      ribbonAura = max(aura1, aura2);
      spineX = (spine1 + spine2) * 0.5;

      float flow1 = twistedP.y * 1.3 - dx1 * 2.0 + t * 0.4;
      float flow2 = twistedP.y * 1.3 + dx2 * 2.0 - t * 0.4;
      vec3 col1 = spectralPalette(flow1, 2);
      vec3 col2 = spectralPalette(flow2 + 0.3, 2);
      
      float mixRatio = clamp(core2 / max(core1 + core2, 0.001), 0.0, 1.0);
      ribbonColor = mix(col1, col2, mixRatio);

      float spec1 = pow(clamp(1.0 - abs(dx1) / max(w1, 0.01), 0.0, 1.0), 2.5);
      float spec2 = pow(clamp(1.0 - abs(dx2) / max(w2, 0.01), 0.0, 1.0), 2.5);
      ribbonColor += vec3(1.0, 0.96, 0.92) * (spec1 + spec2) * 0.45;

      float shadow1 = exp(-pow(abs(dx1 + 0.08) / (w1 * 1.5), 2.0) * 3.0);
      float shadow2 = exp(-pow(abs(dx2 - 0.08) / (w2 * 1.5), 2.0) * 3.0);
      darkVoid = clamp(shadow1 * 0.7 + shadow2 * 0.7, 0.0, 1.0);
      flowCoord = (core1 > core2) ? flow1 : flow2;

      htAngle = PI * 0.15;

    } else if (preset == 3) {
      // 模式 3: 浮光過隙 (Aurora Rift)
      float riftSpine = sin(twistedP.y * 1.5 + t * 0.5) * 0.36 + cos(twistedP.y * 0.75 - t * 0.2) * 0.16;
      float taper = clamp(0.70 - twistedP.y * 0.35, 0.30, 1.25);
      float riftWidth = 0.24 * taper + 0.05 * sin(twistedP.y * 3.8 + t * 0.7);
      
      spineX = riftSpine;
      dx = twistedP.x - riftSpine;
      float normDist = abs(dx) / max(riftWidth, 0.01);

      float coreSharpness = mix(18.0, 6.0, u_defocus);
      ribbonCore = exp(-normDist * normDist * coreSharpness);
      float edgeRazor = exp(-pow(abs(dx + 0.035 * riftWidth) / (riftWidth * 0.25), 2.0) * 12.0);
      ribbonCore = max(ribbonCore, edgeRazor * 1.15);
      ribbonAura = exp(-normDist * 1.5) * 0.5;

      flowCoord = twistedP.y * 1.8 - dx * 2.8 + t * 0.6;
      vec3 colR = spectralPalette(flowCoord + disp * 1.2, 3);
      vec3 colG = spectralPalette(flowCoord, 3);
      vec3 colB = spectralPalette(flowCoord - disp * 1.2, 3);
      ribbonColor = vec3(colR.r, colG.g, colB.b);

      float specular = pow(clamp(1.0 - normDist * 1.5, 0.0, 1.0), 4.0);
      ribbonColor += vec3(0.92, 0.98, 1.0) * specular * 0.85;

      float shadowOffset = 0.18 * riftWidth;
      float shadowDist = abs(dx - shadowOffset);
      float shadowWidth = riftWidth * 2.1;
      darkVoid = exp(-pow(shadowDist / shadowWidth, 2.0) * 3.0);

      htAngle = PI * 0.40;

    } else {
      // 模式 4: 晶透琉璃 (Prismatic Glaze)
      // 晶體切面幾何折線、液態琉璃的高折射率反光與焦散
      float spineWave1 = sin(twistedP.y * 1.9 + t * 0.58) * 0.30;
      float spineWave2 = cos(twistedP.y * 3.4 - t * 0.42) * 0.12;
      float crystalFacet = sin(twistedP.y * 7.0 + t * 0.75) * 0.045;
      spineX = spineWave1 + spineWave2 + crystalFacet;
      dx = twistedP.x - spineX;

      float glassWidth = 0.23 + 0.09 * sin(twistedP.y * 2.8 + t * 0.45);
      float absDx = abs(dx);
      float normDist = absDx / max(glassWidth, 0.01);

      float coreSharpness = mix(16.0, 5.5, u_defocus);
      ribbonCore = exp(-normDist * normDist * coreSharpness);

      // 琉璃內部折射稜面 (棱角焦散折光)
      float facetRidge = cos(dx * 28.0 + twistedP.y * 12.0 - t * 1.5);
      float internalCaustic = exp(-pow(normDist * 1.3, 2.0) * 8.0) * (0.6 + 0.4 * facetRidge);
      ribbonCore = max(ribbonCore, internalCaustic * 0.95);
      ribbonAura = exp(-normDist * 1.6) * 0.48;

      flowCoord = twistedP.y * 1.5 - dx * 2.5 + t * 0.52 + facetRidge * 0.06;
      vec3 colR = spectralPalette(flowCoord + disp * 1.5, 4);
      vec3 colG = spectralPalette(flowCoord, 4);
      vec3 colB = spectralPalette(flowCoord - disp * 1.5, 4);
      ribbonColor = vec3(colR.r, colG.g, colB.b);

      // 琉璃鑽石稜鏡雙重高光
      float specularCenter = pow(clamp(1.0 - normDist * 1.6, 0.0, 1.0), 4.5);
      float specularRim = pow(clamp(1.0 - abs(normDist - 0.72) * 3.5, 0.0, 1.0), 3.0) * 0.6;
      ribbonColor += vec3(1.0, 0.98, 0.92) * specularCenter * 0.85;
      ribbonColor += vec3(0.70, 0.95, 1.0) * specularRim * 0.60;

      float shadowCenter = 0.14 * glassWidth;
      float shadowDist = abs(dx - shadowCenter);
      float shadowWidth = glassWidth * 1.9;
      darkVoid = exp(-pow(shadowDist / shadowWidth, 2.0) * 3.2);

      htAngle = PI * 0.35;
      htScale = mix(75.0, 165.0, u_halftone_scale);
    }
  }

  void main() {
    vec2 uv = v_uv;
    vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    vec2 p = (uv - 0.5) * aspect;

    vec2 mouseP = (u_mouse - 0.5) * aspect;
    vec2 mouseDelta = p - mouseP;
    float mouseDist = length(mouseDelta);

    float vortexStrength = u_vortex_power * exp(-mouseDist * 3.2);
    float angleOffset = vortexStrength * 4.2;
    float cosA = cos(angleOffset);
    float sinA = sin(angleOffset);
    vec2 twistedP = mouseP + vec2(
      cosA * mouseDelta.x - sinA * mouseDelta.y,
      sinA * mouseDelta.x + cosA * mouseDelta.y
    );

    // ----------------------------------------------------------------------
    // ----------------------------------------------------------------------
    // 有機流體自然漫射水波與柔順拖曳航跡系統 (Organic Liquid Ripple & Soft Fluid Wake)
    // 消除生硬中線，呈現寬潤自然、平滑流動的水面推浪質感
    // ----------------------------------------------------------------------
    vec2 rippleDisplace = vec2(0.0);
    float rippleShimmer = 0.0;
    const vec2 ripLightDir = vec2(-0.5547, 0.8320); // 來自左上方的自然環境主光源方向

    // 柔和水槽寬度 (溫潤自然的航跡核心寬度，消除生硬細線)
    const float coreWidth = 0.034;

    for (int i = 0; i < 20; i++) {
      float strength = u_ripples_a[i].w;
      if (strength <= 0.001) continue;

      float tA = u_ripples_a[i].z;
      float tB = u_ripples_b[i].z;
      float isSeg = u_ripples_b[i].w;

      vec2 posA = (u_ripples_a[i].xy - 0.5) * aspect;
      vec2 posB = (u_ripples_b[i].xy - 0.5) * aspect;

      float h = 0.0;
      vec2 closestP = posA;
      vec2 ab = posB - posA;
      float lenAB = length(ab);
      float tailFade = 1.0;

      // 若為連續拖曳段，精確計算主體航跡與尾端真實擴散扇區 (V-Wake Flaring Dispersion)
      if (isSeg > 0.5 && lenAB > 0.0005) {
        vec2 uDir = ab / lenAB;
        vec2 vDir = vec2(-uDir.y, uDir.x);
        vec2 pRel = p - posA;
        float projLong = dot(pRel, uDir);
        float proj = projLong / lenAB;

        if (proj >= 0.0) {
          // 航跡主體與前進頭部
          h = min(proj, 1.0);
          closestP = posA + h * ab;
        } else {
          // 尾端擴散扇區：徹底破除圓弧形穹頂，如真實尾波般向後、向外呈 V 字形展開消散
          float backDist = -projLong; // 沿反方向向後的距離 (> 0)
          float latDist = abs(dot(pRel, vDir));
          float latSign = (dot(pRel, vDir) >= 0.0) ? 1.0 : -1.0;

          // 尾波向兩側展開的擴散率 (~27 度扇形開口)
          float flareRate = 0.52;
          float flareOffset = backDist * flareRate;
          closestP = posA + (vDir * latSign) * flareOffset;

          // 尾部中央破除閉合圓弧（中軸不閉合，向外散開）
          float tailCenterOpen = smoothstep(0.002, coreWidth * 1.6, latDist + flareOffset * 0.8);
          // 沿擴散方向溫潤消散融於水面 (延展 20% 散逸長度)
          tailFade = exp(-pow(backDist / 0.192, 1.7)) * tailCenterOpen;
          h = 0.0;
        }
      }

      float birthTime = mix(tA, tB, h);
      float age = u_time - birthTime;

      if (age >= 0.0 && age < 4.8) {
        vec2 deltaP = p - closestP;
        float rawDist = length(deltaP);

        // 柔化中心線：利用雙曲平滑半徑，將中心尖銳折痕轉化為柔和寬潤的自然水槽 (U-shaped furrow)
        float dist = (isSeg > 0.5)
          ? sqrt(rawDist * rawDist + coreWidth * coreWidth) - coreWidth * 0.35
          : rawDist;

        // 空間流場微擾 (純空間微擾破除幾何死板感，不引入角度諧波，無旋轉與葉瓣感)
        float fluidPerturb = snoise(deltaP * 2.2 + birthTime * 0.15) * 0.016;
        float organicDist = dist + fluidPerturb * smoothstep(0.03, 0.40, dist);

        // 傳播速度與波前半徑 (拖曳時起始帶有寬潤基礎波寬)
        float waveSpeed = 0.28;
        float baseRadius = (isSeg > 0.5) ? (coreWidth * 0.65) : 0.0;
        float waveRadius = baseRadius + age * waveSpeed;
        float deltaDist1 = organicDist - waveRadius;

        // 因果性平滑過渡：波前未受擾動水面維持靜謐
        float causality = 1.0 - smoothstep(-0.045, 0.045, deltaDist1);

        // 1. 第一道主波 (Outer Primary Crest) - 寬波形、柔舒展開
        float packetWidth1 = 0.088 + age * 0.048;
        float env1 = exp(-pow(deltaDist1 / packetWidth1, 2.0) * 3.0) * causality;
        float phase1 = deltaDist1 * 22.0; // 略微放緩頻率，讓水波更舒展寬厚大氣
        float wave1 = (cos(phase1) + 0.20 * cos(phase1 * 2.0)) * env1;
        float slope1 = -sin(phase1) * env1;

        // 2. 第二道次波 (Inner Secondary Rebound Crest - 隨中心反彈水柱自然激發)
        float waveSpacing = 0.105 + age * 0.024;
        float deltaDist2 = deltaDist1 + waveSpacing;
        float wave2Birth = smoothstep(0.10, 0.38, age);
        float packetWidth2 = 0.092 + age * 0.050;
        float env2 = exp(-pow(deltaDist2 / packetWidth2, 2.0) * 3.0) * wave2Birth;
        float phase2 = deltaDist2 * 22.0;
        float wave2 = (cos(phase2) + 0.20 * cos(phase2 * 2.0)) * env2 * 0.60;
        float slope2 = -sin(phase2) * env2 * 0.60;

        // 雙波複合總波幅與法線斜率
        float wave = wave1 + wave2;
        float totalSlope = slope1 + slope2;

        // 雙重物理黏滯消散：
        // 1. 雙曲阻尼與長效平滑衰減 (延展 20% 存續時間與傳播距離)
        float timeFade = (1.0 - smoothstep(0.0, 4.8, age)) * (1.0 / (1.0 + age * 0.54));
        // 2. 能量自然擴散衰減 (1/sqrt(r))
        float geoFade = 1.0 / sqrt(max(dist, 0.04) * 2.8 + 0.7);

        // 兩端過渡羽化 (消除線段接縫硬感)
        float segmentFeather = 1.0;
        if (isSeg > 0.5) {
          segmentFeather = smoothstep(0.0, 0.18, h) * smoothstep(1.0, 0.82, h);
          segmentFeather = mix(0.75, 1.0, segmentFeather);
        }

        float amp = wave * timeFade * geoFade * strength * segmentFeather * tailFade;

        // 中心平滑衰退：在中心線 rawDist -> 0 處平滑過渡至 0，徹底消滅中心刺眼細線
        float centerFade = (isSeg > 0.5) ? smoothstep(0.002, coreWidth * 1.4, rawDist) : 1.0;
        vec2 dir = (rawDist > 0.0005) ? (deltaP / rawDist) * centerFade : vec2(0.0);
        rippleDisplace -= dir * (amp * 0.034);

        // 雙重波紋立體光影（高光聚焦於兩側水脊，中心維持通透平滑）
        float slope = totalSlope * timeFade * geoFade * strength * segmentFeather * centerFade * tailFade;
        float lightDot = dot(dir, ripLightDir);
        float shade3D = slope * (0.08 + lightDot * 0.12);
        float specular = pow(max(0.0, lightDot * 0.5 + 0.5), 3.0) * max(0.0, slope) * 0.12;
        rippleShimmer += shade3D + specular;
      }
    }

    twistedP += clamp(rippleDisplace, vec2(-0.06), vec2(0.06));

    float t = u_time * u_flow_speed * 0.28;
    float disp = u_dispersion * 0.05;

    float spineX = 0.0;
    float dx = 0.0;
    float ribbonCore = 0.0;
    float ribbonAura = 0.0;
    float darkVoid = 0.0;
    float flowCoord = 0.0;
    float htScale = mix(65.0, 155.0, u_halftone_scale);
    float htAngle = PI * 0.25;
    vec3 ribbonColor = vec3(0.0);

    if (u_preset_mix >= 1.0 || u_preset_from == u_preset_to) {
      evaluatePreset(u_preset_to, twistedP, t, disp, ribbonColor, ribbonCore, ribbonAura, darkVoid, spineX, flowCoord, htAngle, htScale);
    } else {
      vec3 colA = vec3(0.0);
      vec3 colB = vec3(0.0);
      float coreA = 0.0, coreB = 0.0;
      float auraA = 0.0, auraB = 0.0;
      float voidA = 0.0, voidB = 0.0;
      float sXA = 0.0, sXB = 0.0;
      float flowA = 0.0, flowB = 0.0;
      float hAngleA = PI * 0.25, hAngleB = PI * 0.25;
      float hScaleA = htScale, hScaleB = htScale;

      evaluatePreset(u_preset_from, twistedP, t, disp, colA, coreA, auraA, voidA, sXA, flowA, hAngleA, hScaleA);
      evaluatePreset(u_preset_to, twistedP, t, disp, colB, coreB, auraB, voidB, sXB, flowB, hAngleB, hScaleB);

      float blend = smoothstep(0.0, 1.0, u_preset_mix);
      ribbonColor = mix(colA, colB, blend);
      ribbonCore = mix(coreA, coreB, blend);
      ribbonAura = mix(auraA, auraB, blend);
      darkVoid = mix(voidA, voidB, blend);
      spineX = mix(sXA, sXB, blend);
      flowCoord = mix(flowA, flowB, blend);
      htAngle = mix(hAngleA, hAngleB, blend);
      htScale = mix(hScaleA, hScaleB, blend);
    }

    float verticalFade = 1.0 - smoothstep(0.45, 0.92, abs(twistedP.y));
    darkVoid *= verticalFade;
    ribbonCore *= verticalFade;
    ribbonAura *= verticalFade;

    // 背景設定 (平滑淡入淡出五種背景底色，絲滑過渡絕不硬切)
    vec3 paperWhite = vec3(0.97, 0.97, 0.98);
    vec3 voidDark   = vec3(0.05, 0.06, 0.08);

    float subtleSplit = 1.0 - smoothstep(-0.35, 0.35, twistedP.x - spineX * 0.5);
    vec3 mode0Bg = mix(paperWhite, vec3(0.08, 0.09, 0.12), subtleSplit * 0.92);                          // 0: 水墨 (雙色水墨)
    vec3 mode1Bg = voidDark;                                                                              // 1: 玄黑 (純粹玄黑)
    vec3 mode2Bg = paperWhite;                                                                            // 2: 紙白 (明亮宣紙)
    vec3 mode3Bg = mix(vec3(0.025, 0.048, 0.095), vec3(0.045, 0.082, 0.145), twistedP.y * 0.35 + 0.5); // 3: 黛藍 (深邃礦物靛藍)
    vec3 mode4Bg = mix(vec3(0.085, 0.032, 0.048), vec3(0.138, 0.054, 0.076), twistedP.y * 0.35 + 0.5); // 4: 赤霞 (溫潤宮廷絳霞)

    vec3 canvasBg = mode0Bg * u_bg_weights[0] +
                    mode1Bg * u_bg_weights[1] +
                    mode2Bg * u_bg_weights[2] +
                    mode3Bg * u_bg_weights[3] +
                    mode4Bg * u_bg_weights[4];

    vec3 baseScene = mix(canvasBg, voidDark, darkVoid * 0.95);
    vec3 compositeColor = mix(baseScene, ribbonColor, clamp(ribbonCore * 1.25 + ribbonAura * 0.6, 0.0, 1.0));

    // ----------------------------------------------------------------------
    // 數位半色調點陣矩陣 (Dispersing Digital Halftone Grid)
    // ----------------------------------------------------------------------
    float edgeBand = smoothstep(0.05, 0.85, darkVoid);
    float htDensity = clamp(edgeBand * 1.35, 0.0, 1.0);

    float dots = halftonePattern(twistedP, htAngle, htScale, htDensity);
    vec3 dotTintTo = spectralPalette(flowCoord + 0.18, u_preset_to);
    vec3 dotTintFrom = spectralPalette(flowCoord + 0.18, u_preset_from);
    float blendDot = (u_preset_mix >= 1.0 || u_preset_from == u_preset_to) ? 1.0 : smoothstep(0.0, 1.0, u_preset_mix);
    vec3 dotTint = mix(voidDark, mix(dotTintFrom, dotTintTo, blendDot), 0.55);
    compositeColor = mix(compositeColor, dotTint, dots * edgeBand * 0.9);

    // ----------------------------------------------------------------------
    // 水面物理折射微光光影 (Natural Fluid Caustics & Shimmer)
    // ----------------------------------------------------------------------
    float clampedShimmer = clamp(rippleShimmer, -0.5, 1.8);
    vec3 shimmerLight = vec3(clampedShimmer * 0.13);
    vec3 shimmerDark = vec3(0.92, 0.96, 1.0) * clampedShimmer * 0.18;
    vec3 rippleShimmerCol = mix(shimmerDark, shimmerLight, u_bg_weights[2]);
    compositeColor += rippleShimmerCol;

    compositeColor = clamp(compositeColor, 0.0, 1.0);
    vec3 macroScene = pow(compositeColor, vec3(1.0 / max(u_contrast, 0.1)));

    // ----------------------------------------------------------------------
    // 震撼的電子塵埃微粒層 (Luminous Electronic Stardust)
    // ----------------------------------------------------------------------
    float dustMask = mix(0.45, 1.85, darkVoid + ribbonAura);
    vec3 stardust = electronicStardust(uv, u_time, dustMask);
    float dustAmount = u_grain * 0.22;
    vec3 sceneWithDust = macroScene + stardust * dustAmount;

    // ----------------------------------------------------------------------
    // 純黑白動態反白文字 (Strict Monochrome Black & White Text Inversion)
    // 關鍵設計：反白判定嚴格依據宏觀光影 (macroScene)，灰塵噪波微粒不觸發文字反白
    // 亮底顯墨黑，暗底顯純白，字符純粹無噪點穿透
    // ----------------------------------------------------------------------
    vec4 textSample = texture2D(u_text_texture, uv);
    if (textSample.a > 0.005) {
      // 僅依據宏觀流光、暗影與底色的感知亮度，灰塵微粒不參與反白計算
      float bgLum = dot(macroScene.rgb, vec3(0.299, 0.587, 0.114));
      vec3 targetTextColor = (bgLum > 0.46) ? vec3(0.04, 0.04, 0.04) : vec3(0.98, 0.98, 0.98);
      compositeColor = mix(sceneWithDust, targetTextColor, textSample.a);
    } else {
      compositeColor = sceneWithDust;
    }

    gl_FragColor = vec4(compositeColor, 1.0);
  }
`;

// ============================================================================
// 2. WebGL 控制器與互動邏輯
// ============================================================================
class IridescentApp {
  getDefaultSettings() {
    return {
      preset: 0,
      lightMode: 3,
      flowSpeed: 0.60,
      dispersion: 1.20,
      grain: 0.60,
      cursorInfluence: 0.20,
      customPalette: ['#ff5a82', '#28c3ff', '#a04bff'],
      customPaletteEnabled: false,
      customPaletteSlots: [[], [], []]
    };
  }

  normalizeHexColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  }

  normalizePaletteSlots(slots) {
    const defaults = this.getDefaultSettings().customPalette;
    if (!Array.isArray(slots) || slots.length !== 3) return [[], [], []];
    return slots.map((slot) => {
      if (!Array.isArray(slot) || slot.length !== 3) return [];
      return slot.map((color, index) => this.normalizeHexColor(color, defaults[index]));
    });
  }

  hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  }

  loadSettings() {
    let loaded = null;
    if (window.__INITIAL_SETTINGS__ && typeof window.__INITIAL_SETTINGS__ === 'object') {
      loaded = window.__INITIAL_SETTINGS__;
    } else {
      try {
        const raw = localStorage.getItem('rainbowflow_user_settings');
        if (raw) loaded = JSON.parse(raw);
      } catch (e) {}
    }

    const defaults = this.getDefaultSettings();
    const s = Object.assign({}, defaults, loaded);

    if (!Number.isInteger(s.preset) || s.preset < 0 || s.preset > 4) s.preset = defaults.preset;
    if (!Number.isInteger(s.lightMode) || s.lightMode < 0 || s.lightMode > 4) s.lightMode = defaults.lightMode;
    if (typeof s.flowSpeed !== 'number' || isNaN(s.flowSpeed) || s.flowSpeed < 0.1 || s.flowSpeed > 2.5) s.flowSpeed = defaults.flowSpeed;
    if (typeof s.dispersion !== 'number' || isNaN(s.dispersion) || s.dispersion < 0.0 || s.dispersion > 3.0) s.dispersion = defaults.dispersion;
    if (typeof s.grain !== 'number' || isNaN(s.grain) || s.grain < 0.1 || s.grain > 2.5) s.grain = defaults.grain;
    if (typeof s.cursorInfluence !== 'number' || isNaN(s.cursorInfluence) || s.cursorInfluence < 0.0 || s.cursorInfluence > 5.0) s.cursorInfluence = defaults.cursorInfluence;
    if (!Array.isArray(s.customPalette) || s.customPalette.length !== 3) {
      s.customPalette = defaults.customPalette.slice();
    } else {
      s.customPalette = s.customPalette.map((color, index) => this.normalizeHexColor(color, defaults.customPalette[index]));
    }
    s.customPaletteEnabled = s.customPaletteEnabled === true;
    const savedSlots = loaded && Array.isArray(loaded.customPaletteSlots) && loaded.customPaletteSlots.length === 3
      ? loaded.customPaletteSlots
      : (loaded && Array.isArray(loaded.customPalette) ? [s.customPalette.slice(), [], []] : defaults.customPaletteSlots);
    s.customPaletteSlots = this.normalizePaletteSlots(savedSlots);

    return s;
  }

  saveSettings() {
    const committedPalette = this.paletteEditSnapshot || {
      colors: this.state.customPalette,
      enabled: this.state.customPaletteEnabled
    };
    const current = {
      preset: this.state.preset,
      lightMode: this.state.lightMode,
      flowSpeed: this.state.flowSpeed,
      dispersion: this.state.dispersion,
      grain: this.state.grain,
      cursorInfluence: this.state.cursorInfluence,
      customPalette: committedPalette.colors.slice(),
      customPaletteEnabled: committedPalette.enabled,
      customPaletteSlots: this.state.customPaletteSlots.map((slot) => slot.slice())
    };
    this.lastSettingsSave = { settings: current, savedAt: Date.now() };

    // 1. 瀏覽器端 LocalStorage 保存
    try {
      localStorage.setItem('rainbowflow_user_settings', JSON.stringify(current));
    } catch (e) {}

    // 2. 原生 macOS 端 UserDefaults 保存
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
      window.webkit.messageHandlers.macApp.postMessage({
        action: 'saveSettings',
        settings: current,
        savedAt: this.lastSettingsSave.savedAt
      });
    }
  }

  queueSaveSettings() {
    this.saveSettings();
  }

  constructor() {
    this.canvas = document.getElementById('gl-canvas');
    this.gl = null;
    this.program = null;
    this.uniforms = {};

    const initialSettings = this.loadSettings();

    this.state = {
      preset: initialSettings.preset,
      presetFrom: initialSettings.preset,
      presetTo: initialSettings.preset,
      presetTransition: 1.0,
      flowSpeed: initialSettings.flowSpeed,
      dispersion: initialSettings.dispersion,
      grain: initialSettings.grain,
      halftoneScale: 0.50,
      vortexPower: 0.0,
      cursorInfluence: initialSettings.cursorInfluence,
      defocus: 0.30,
      contrast: 1.15,
      lightMode: initialSettings.lightMode,
      customPalette: initialSettings.customPalette.slice(),
      customPaletteEnabled: initialSettings.customPaletteEnabled,
      customPaletteSlots: initialSettings.customPaletteSlots.map((slot) => slot.slice()),
      bgWeights: [
        initialSettings.lightMode === 0 ? 1.0 : 0.0,
        initialSettings.lightMode === 1 ? 1.0 : 0.0,
        initialSettings.lightMode === 2 ? 1.0 : 0.0,
        initialSettings.lightMode === 3 ? 1.0 : 0.0,
        initialSettings.lightMode === 4 ? 1.0 : 0.0
      ],
      targetBgWeights: [
        initialSettings.lightMode === 0 ? 1.0 : 0.0,
        initialSettings.lightMode === 1 ? 1.0 : 0.0,
        initialSettings.lightMode === 2 ? 1.0 : 0.0,
        initialSettings.lightMode === 3 ? 1.0 : 0.0,
        initialSettings.lightMode === 4 ? 1.0 : 0.0
      ],
      isPaused: false,
      viewMode: 'normal' // 'normal' | 'hide_buttons' | 'hide_all'
    };

    this.updateThemeClass();

    this.startTime = performance.now();
    this.time = 0;
    this.lastFrameTime = performance.now();

    this.mouse = {
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      vx: 0,
      vy: 0
    };

    this.controlsPanel = document.getElementById('controls-panel');
    this.customPaletteRGB = this.state.customPalette.map((color) => this.hexToRgb(color));
    this.customPaletteTargetRGB = this.customPaletteRGB.map((color) => color.slice());
    this.paletteEditSnapshot = null;
    this.paletteEditDirty = false;
    this.paletteSlotSelection = 0;
    this.paletteSaveFeedbackTimer = null;
    this.openPaletteInput = null;

    // 物理擴散水波與連續拖曳航跡隊列 (20 組，支援單點漣漪與完全連續的流體航跡)
    this.maxRipples = 20;
    this.ripplesA = Array.from({ length: this.maxRipples }, () => ({ x: 0.5, y: 0.5, time: -100.0, strength: 0.0 }));
    this.ripplesB = Array.from({ length: this.maxRipples }, () => ({ x: 0.5, y: 0.5, time: -100.0, isSegment: 0.0 }));
    this.rippleIndex = 0;
    this.rippleDataA = new Float32Array(this.maxRipples * 4);
    this.rippleDataB = new Float32Array(this.maxRipples * 4);

    // 拖曳航跡水波狀態 (動態追蹤筆觸與航跡線段，創造完全自然連續的側向推水波)
    this.isDragging = false;
    this.isDraggingTouch = false;
    this.currentDragSlot = -1;
    this.lastDragAnchor = null;
    this.dragSmoothed = null;

    // 純黑白動態反白文字紋理系統
    this.textCanvas = null;
    this.textCtx = null;
    this.textTexture = null;
    this.rafId = null;
    this.isRendering = false;
    this.contextLost = false;

    // 螢幕主從角色與外接螢幕設定 (預設為副螢幕延伸: 主螢幕文字，副螢幕純淨)
    const screenInfo = window.__SCREEN_INFO__ || { isMain: true, mode: 'secondary_extend' };
    this.screenRole = { isMain: screenInfo.isMain, mode: screenInfo.mode };
    if (!this.shouldDisplayText(this.screenRole.isMain, this.screenRole.mode)) {
      document.body.classList.add('satellite-screen');
    }

    this.init();
  }

  shouldDisplayText(isMain, mode) {
    switch (mode) {
      case 'secondary_extend': // 1. 副螢幕延伸 (主螢幕文字，副螢幕純淨)
        return isMain;
      case 'primary_extend':   // 2. 主螢幕延伸 (副螢幕文字，主螢幕純淨)
        return !isMain;
      case 'all_pure':         // 3. 雙螢幕純淨 (兩者皆純淨無文字)
        return false;
      case 'all_text':         // 4. 雙螢幕文字顯示 (兩者皆有文字)
        return true;
      default:
        return isMain;
    }
  }

  updateScreenRole(isMain, mode) {
    this.screenRole = { isMain, mode };
    const hasText = this.shouldDisplayText(isMain, mode);
    document.body.classList.remove('satellite-controls-visible');
    if (!hasText) {
      document.body.classList.add('satellite-screen');
    } else {
      document.body.classList.remove('satellite-screen');
    }
    this.renderTextTexture();
  }

  addRipple(clientX, clientY, strength = 1.0) {
    if (this.state.isPaused) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width));
    const y = Math.max(0.0, Math.min(1.0, 1.0 - (clientY - rect.top) / rect.height));

    const slot = this.rippleIndex;
    this.rippleIndex = (this.rippleIndex + 1) % this.maxRipples;

    this.ripplesA[slot] = {
      x,
      y,
      time: this.time,
      strength: Math.max(0.0, Math.min(2.0, strength))
    };
    this.ripplesB[slot] = {
      x,
      y,
      time: this.time,
      isSegment: 0.0 // 單點同心圓擴散
    };
  }

  startDrag(clientX, clientY) {
    if (this.state.isPaused) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0.0, Math.min(1.0, (clientX - rect.left) / rect.width));
    const y = Math.max(0.0, Math.min(1.0, 1.0 - (clientY - rect.top) / rect.height));

    const slot = this.rippleIndex;
    this.rippleIndex = (this.rippleIndex + 1) % this.maxRipples;
    this.currentDragSlot = slot;

    // 起始為單點觸發水花
    this.ripplesA[slot] = { x, y, time: this.time, strength: 0.9 };
    this.ripplesB[slot] = { x, y, time: this.time, isSegment: 0.0 };

    this.dragSmoothed = { clientX, clientY, x, y };
    this.lastDragAnchor = {
      clientX,
      clientY,
      x,
      y,
      time: this.time
    };
  }

  updateDrag(clientX, clientY) {
    if (this.state.isPaused || !this.lastDragAnchor) return;
    const rect = this.canvas.getBoundingClientRect();

    // 平滑濾波：消除滑鼠/觸控微小抖動，讓弧線更為圓融連續
    if (!this.dragSmoothed) {
      this.dragSmoothed = { clientX, clientY, x: 0.5, y: 0.5 };
    }
    const smoothFactor = 0.55;
    this.dragSmoothed.clientX += (clientX - this.dragSmoothed.clientX) * smoothFactor;
    this.dragSmoothed.clientY += (clientY - this.dragSmoothed.clientY) * smoothFactor;

    const curX = Math.max(0.0, Math.min(1.0, (this.dragSmoothed.clientX - rect.left) / rect.width));
    const curY = Math.max(0.0, Math.min(1.0, 1.0 - (this.dragSmoothed.clientY - rect.top) / rect.height));
    this.dragSmoothed.x = curX;
    this.dragSmoothed.y = curY;

    const dx = this.dragSmoothed.clientX - this.lastDragAnchor.clientX;
    const dy = this.dragSmoothed.clientY - this.lastDragAnchor.clientY;
    const dist = Math.hypot(dx, dy);

    // 微幅移動即可轉化為連續線段航跡（完全消除離散連點感）
    if (dist >= 3.0 && this.currentDragSlot >= 0) {
      const slot = this.currentDragSlot;
      this.ripplesB[slot].x = curX;
      this.ripplesB[slot].y = curY;
      this.ripplesB[slot].time = this.time;
      this.ripplesB[slot].isSegment = 1.0;
      this.ripplesA[slot].strength = 0.72; // 連續拖曳的柔和水光強度
    }

    // 縮短步長門檻 (約 20px)，讓弧線轉折極其細膩圓融，徹底消除「一段一段」的生硬折角感
    const segmentLengthThreshold = 20.0;
    if (dist >= segmentLengthThreshold) {
      const nextSlot = this.rippleIndex;
      this.rippleIndex = (this.rippleIndex + 1) % this.maxRipples;

      this.ripplesA[nextSlot] = {
        x: curX,
        y: curY,
        time: this.time,
        strength: 0.72
      };
      this.ripplesB[nextSlot] = {
        x: curX,
        y: curY,
        time: this.time,
        isSegment: 1.0
      };

      this.currentDragSlot = nextSlot;
      this.lastDragAnchor = {
        clientX: this.dragSmoothed.clientX,
        clientY: this.dragSmoothed.clientY,
        x: curX,
        y: curY,
        time: this.time
      };
    }
  }

  endDrag() {
    this.isDragging = false;
    this.isDraggingTouch = false;
    this.currentDragSlot = -1;
    this.lastDragAnchor = null;
    this.dragSmoothed = null;
  }

  drawSpacedText(ctx, text, x, y, letterSpacing) {
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${letterSpacing}px`;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
      return;
    }
    let curX = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, curX, y);
      curX += ctx.measureText(ch).width + letterSpacing;
    }
  }

  drawVerticalText(ctx, text, x, y, step) {
    let curY = y;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, x, curY);
      curY += step;
    }
  }

  uploadTextTexture() {
    const gl = this.gl;
    if (!gl || !this.textCanvas || this.textCanvas.width === 0 || this.textCanvas.height === 0) return;

    if (!this.textTexture) {
      this.textTexture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  renderTextTexture() {
    if (!this.gl) return;
    if (!this.textCanvas) {
      this.textCanvas = document.createElement('canvas');
      this.textCtx = this.textCanvas.getContext('2d');
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.textCanvas.width = width * dpr;
    this.textCanvas.height = height * dpr;

    const ctx = this.textCtx;
    ctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

    const isMain = this.screenRole ? this.screenRole.isMain : true;
    const mode = this.screenRole ? this.screenRole.mode : 'secondary_extend';
    const hasText = this.shouldDisplayText(isMain, mode);

    if (!hasText || this.state.viewMode === 'hide_all') {
      this.uploadTextTexture();
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const serifFont = "'Hiragino Mincho ProN', 'Songti SC', 'STSong', 'PMingLiU', serif";

    // 1. 品牌主標題 (GRAND MODERN CHINA)
    const isMobile = width <= 900;
    const leftX = isMobile ? 1.5 * rem : 3.5 * rem;
    const brandMainSize = (isMobile ? 1.1 : 1.35) * rem;
    const subSize = (isMobile ? 0.7 : 0.75) * rem;
    const totalBrandHeight = brandMainSize * 1.55 + subSize;
    const topY = height * 0.5 - totalBrandHeight * 0.5;

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';

    ctx.font = `600 ${brandMainSize}px 'Hiragino Mincho ProN', serif`;
    ctx.textAlign = 'left';
    this.drawSpacedText(ctx, 'GRAND MODERN CHINA', leftX, topY, 0.48 * brandMainSize);

    // 次標題 (月刊手藝 · 寫新故事 · HOLOGRAPHIC ARCHIVE) - 與右側詩詞統一使用高雅宋體/明體襯線字型
    const subY = topY + brandMainSize * 1.55;
    ctx.font = `400 ${subSize}px ${serifFont}`;
    this.drawSpacedText(ctx, '月刊手藝  ·  寫新故事  ·  HOLOGRAPHIC ARCHIVE', leftX, subY, 0.35 * subSize);

    // 2. 右側直排詩詞 (東方先鋒排版 - 極簡凝練)
    const rightX = width - 3.5 * rem;
    const poemTopY = height * 0.25;
    const poemFontSize = 1.25 * rem;
    const poemCharStep = poemFontSize * 1.58;
    const colGap = 2.4 * rem;

    ctx.font = `400 ${poemFontSize}px ${serifFont}`;
    ctx.textAlign = 'center';

    // 行 1: 虹光流動成詩
    this.drawVerticalText(ctx, '虹光流動成詩', rightX, poemTopY, poemCharStep);
    // 行 2: 方寸微塵相生
    this.drawVerticalText(ctx, '方寸微塵相生', rightX - colGap, poemTopY, poemCharStep);

    // 精準計算中文首字實際頂部墨跡基準線，確保旋轉後的英文直排頂部與中文首字頂部切齊
    const cjkMetrics = ctx.measureText('虹');
    const cjkInkTopOffset = (cjkMetrics && typeof cjkMetrics.actualBoundingBoxAscent === 'number')
      ? -cjkMetrics.actualBoundingBoxAscent
      : (0.27 * poemFontSize);

    // 英文年份標註（加計 0.125 * poemFontSize 視覺光學補償，確保 P 頂端與中文橫筆/點首字在像素級完全切齊）
    const annotSize = 0.65 * rem;
    ctx.font = `300 ${annotSize}px monospace`;
    const pMetrics = ctx.measureText('P');
    const pLeftOffset = (pMetrics && typeof pMetrics.actualBoundingBoxLeft === 'number')
      ? pMetrics.actualBoundingBoxLeft
      : 0;
    const opticalOffset = 0.125 * poemFontSize;
    const annotTopY = poemTopY + cjkInkTopOffset - pLeftOffset + opticalOffset;

    ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(rightX - colGap * 1.8, annotTopY);
    ctx.rotate(Math.PI * 0.5);
    this.drawSpacedText(ctx, 'PRISM // 2026', 0, 0, 0.25 * annotSize);
    ctx.restore();

    ctx.restore();

    this.uploadTextTexture();
  }

  init() {
    this.initWebGL();
    this.renderTextTexture();
    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.renderTextTexture();
      });
      if (document.fonts.load) {
        document.fonts.load(`400 16px 'Hiragino Mincho ProN'`, '月刊手藝寫新故事虹光流動成詩').then(() => this.renderTextTexture());
        document.fonts.load(`400 16px 'Songti SC'`, '月刊手藝寫新故事虹光流動成詩').then(() => this.renderTextTexture());
      }
    }
    this.setupEventListeners();
    this.setupUI();
    this.onResize();
    this.startRenderLoop();
  }

  initWebGL() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      if (!this.contextLost) alert('您的瀏覽器不支援 WebGL');
      return false;
    }
    this.gl = gl;

    const vertShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertShader || !fragShader) {
      if (vertShader) gl.deleteShader(vertShader);
      if (fragShader) gl.deleteShader(fragShader);
      this.gl = null;
      return false;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      this.gl = null;
      return false;
    }
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
    this.program = program;
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uniformNames = [
      'u_resolution', 'u_time', 'u_mouse',
      'u_preset_from', 'u_preset_to', 'u_preset_mix', 'u_bg_weights',
      'u_flow_speed', 'u_dispersion', 'u_grain',
      'u_halftone_scale', 'u_vortex_power', 'u_defocus', 'u_contrast',
      'u_custom_palette_a', 'u_custom_palette_b', 'u_custom_palette_c', 'u_custom_palette_enabled'
    ];
    uniformNames.forEach((name) => {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    });
    this.uniforms.u_bg_weights = gl.getUniformLocation(program, 'u_bg_weights[0]') || gl.getUniformLocation(program, 'u_bg_weights');
    this.uniforms.u_ripples_a = gl.getUniformLocation(program, 'u_ripples_a[0]') || gl.getUniformLocation(program, 'u_ripples_a');
    this.uniforms.u_ripples_b = gl.getUniformLocation(program, 'u_ripples_b[0]') || gl.getUniformLocation(program, 'u_ripples_b');
    this.uniforms.u_text_texture = gl.getUniformLocation(program, 'u_text_texture');
    return true;
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  handleWebGLContextLost(event) {
    event.preventDefault();
    this.contextLost = true;
    this.stopRenderLoop();
  }

  handleWebGLContextRestored() {
    this.contextLost = false;
    this.gl = null;
    this.program = null;
    this.uniforms = {};
    this.textTexture = null;
    if (this.initWebGL()) {
      this.renderTextTexture();
      this.startRenderLoop();
    }
  }

  setupEventListeners() {
    this.canvas.addEventListener('webglcontextlost', (event) => this.handleWebGLContextLost(event));
    this.canvas.addEventListener('webglcontextrestored', () => this.handleWebGLContextRestored());
    window.addEventListener('resize', () => {
      this.onResize();
      this.updatePresetIndicator(false);
      this.updateBgIndicator(false);
    });

    const isUIEventTarget = (target) => target instanceof Element && (
      target.closest('.bottom-dock') || target.closest('.controls-panel') || target.closest('.action-btn')
    );

    const updateMousePos = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.targetX = (clientX - rect.left) / rect.width;
      this.mouse.targetY = 1.0 - (clientY - rect.top) / rect.height;
    };

    window.addEventListener('mousemove', (e) => {
      updateMousePos(e.clientX, e.clientY);
      const overUI = !!isUIEventTarget(e.target);
      document.body.classList.toggle('cursor-over-ui', overUI);

      // 當按住左鍵在畫布上拖曳時，實時動態延展航跡水波
      if ((e.buttons & 1) === 1 && !overUI && !this.state.isPaused) {
        if (!this.isDragging) {
          this.isDragging = true;
          this.startDrag(e.clientX, e.clientY);
        } else {
          this.updateDrag(e.clientX, e.clientY);
        }
      } else if (this.isDragging) {
        this.endDrag();
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state.isPaused) return;
      if (isUIEventTarget(e.target)) return;
      this.isDragging = true;
      this.startDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) this.endDrag();
    });

    window.addEventListener('mouseleave', () => {
      if (this.isDragging) this.endDrag();
    });

    window.addEventListener('blur', () => {
      if (this.isDragging) this.endDrag();
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        updateMousePos(t.clientX, t.clientY);
        if (this.isDraggingTouch && !this.state.isPaused && !isUIEventTarget(e.target)) {
          this.updateDrag(t.clientX, t.clientY);
        }
      }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (this.state.isPaused) return;
      if (e.touches.length > 0) {
        const t = e.touches[0];
        if (isUIEventTarget(e.target)) {
          this.isDraggingTouch = false;
          return;
        }
        this.isDraggingTouch = true;
        this.startDrag(t.clientX, t.clientY);
        updateMousePos(t.clientX, t.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (this.isDraggingTouch) this.endDrag();
    }, { passive: true });

    window.addEventListener('touchcancel', () => {
      if (this.isDraggingTouch) this.endDrag();
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleEscKey();
        return;
      }

      const isInteractiveTarget = e.target instanceof Element
        && !!e.target.closest('button, input, select, textarea, [contenteditable="true"]');
      if (isInteractiveTarget || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'h' || e.key === 'H') {
        this.toggleUI();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === 's' || e.key === 'S') {
        this.capturePoster();
      } else if (e.key >= '1' && e.key <= '5') {
        this.setPreset(parseInt(e.key) - 1);
        this.saveSettings();
      }
    });
  }

  handleEscKey() {
    // 1. 若控制抽屜開啟，先關閉抽屜
    if (this.controlsPanel && this.controlsPanel.classList.contains('open')) {
      this.setControlsPanelOpen(false, { focusTrigger: true });
      return 'closed-panel';
    }

    // 2. 若處於專注模式或全螢幕模式，按第一次 Esc 回到調整介面
    if (this.state.viewMode !== 'normal') {
      document.body.classList.remove('satellite-screen');
      this.setViewMode('normal');
      return 'revealed';
    }

    // 3. 若已在調整介面，再次按 Esc 則是退出螢幕保護程式
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
      window.webkit.messageHandlers.macApp.postMessage({ action: 'exitScreensaver' });
    }
    return 'exit-requested';
  }

  revealSatelliteCapture() {
    const isPureExtendedScreen = this.screenRole
      && ['secondary_extend', 'primary_extend'].includes(this.screenRole.mode)
      && !this.shouldDisplayText(this.screenRole.isMain, this.screenRole.mode);
    if (!isPureExtendedScreen) return;
    this.setViewMode('normal');
    document.body.classList.add('satellite-screen', 'satellite-controls-visible');
  }

  hideSatelliteCapture() {
    document.body.classList.remove('satellite-controls-visible');
  }

  setControlsPanelOpen(open, { focusTrigger = false } = {}) {
    if (!this.controlsPanel) return;
    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    this.controlsPanel.classList.toggle('open', open);
    this.controlsPanel.setAttribute('aria-hidden', String(!open));
    this.controlsPanel.inert = !open;
    this.controlsPanel.toggleAttribute('inert', !open);
    if (togglePanelBtn) {
      togglePanelBtn.classList.toggle('active', open);
      togglePanelBtn.setAttribute('aria-expanded', String(open));
    }

    if (open) {
      this.beginPaletteEdit();
      this.updateBgIndicator(false);
      requestAnimationFrame(() => {
        this.updateBgIndicator(false);
        const firstControl = this.controlsPanel.querySelector('input, button, select, textarea');
        if (firstControl) firstControl.focus({ preventScroll: true });
      });
    } else {
      this.cancelPaletteEdit();
      if (focusTrigger && togglePanelBtn) togglePanelBtn.focus();
    }
  }

  setupUI() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.preset);
        this.setPreset(p);
        this.saveSettings();
      });
    });

    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    if (togglePanelBtn) {
      togglePanelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !this.controlsPanel.classList.contains('open');
        this.setControlsPanelOpen(isOpen, { focusTrigger: !isOpen });
      });
    }

    if (this.controlsPanel) {
      this.controlsPanel.addEventListener('transitionend', (e) => {
        if (e.target === this.controlsPanel && this.controlsPanel.classList.contains('open')) {
          this.updateBgIndicator(false);
        }
      });
    }

    // 點擊面板外部自動優雅收合
    document.addEventListener('click', (e) => {
      if (this.controlsPanel && this.controlsPanel.classList.contains('open')) {
        if (!e.target.closest('#controls-panel') && !e.target.closest('#toggle-panel-btn')) {
          this.setControlsPanelOpen(false);
        }
      }
    });

    const bindSlider = (id, stateKey, valDisplayId, multiplier = 1, decimal = 1) => {
      const el = document.getElementById(id);
      const displayEl = document.getElementById(valDisplayId);
      if (el) {
        el.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value) * multiplier;
          this.state[stateKey] = val;
          if (displayEl) displayEl.innerText = val.toFixed(decimal);
          this.queueSaveSettings();
        });
      }
    };

    bindSlider('slider-speed', 'flowSpeed', 'val-speed', 1, 1);
    bindSlider('slider-dispersion', 'dispersion', 'val-dispersion', 1, 1);
    bindSlider('slider-grain', 'grain', 'val-grain', 1, 1);
    bindSlider('slider-cursor', 'cursorInfluence', 'val-cursor', 1, 1);

    document.querySelectorAll('.palette-color').forEach((input, index) => {
      input.addEventListener('click', (event) => {
        // WKWebView 的原生色票面板沒有網頁端 close API；再次點擊同一
        // 色塊時取消預設開啟行為並移除焦點，即可收回原生面板。
        if (this.openPaletteInput === input) {
          event.preventDefault();
          event.stopPropagation();
          input.blur();
          this.openPaletteInput = null;
          return;
        }
        this.openPaletteInput = input;
      });
      const syncPaletteColor = (event) => {
        const value = this.normalizeHexColor(event.target.value, this.state.customPalette[index]);
        if (value === this.state.customPalette[index]) return;
        this.beginPaletteEdit();
        this.paletteEditDirty = true;
        const colors = this.state.customPalette.slice();
        colors[index] = value;
        this.updateCustomPalette(colors, true);
      };
      input.addEventListener('input', syncPaletteColor);
      input.addEventListener('change', syncPaletteColor);
    });
    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.palette-color')) {
        this.openPaletteInput = null;
      }
    }, true);
    const applyPaletteBtn = document.getElementById('apply-palette-btn');
    if (applyPaletteBtn) {
      applyPaletteBtn.addEventListener('click', () => {
        this.beginPaletteEdit();
        const enabled = this.paletteEditDirty ? this.state.customPaletteEnabled : true;
        this.updateCustomPalette(this.state.customPalette, enabled);
        this.commitPaletteEdit();
        this.saveSettings();
      });
    }
    const resetPaletteBtn = document.getElementById('reset-palette-btn');
    if (resetPaletteBtn) {
      resetPaletteBtn.addEventListener('click', () => {
        this.beginPaletteEdit();
        this.paletteEditDirty = true;
        this.updateCustomPalette(this.getDefaultSettings().customPalette, false);
      });
    }

    document.querySelectorAll('.palette-slot').forEach((button, index) => {
      button.addEventListener('click', () => {
        this.paletteSlotSelection = index;
        const colors = this.state.customPaletteSlots[index];
        if (colors.length === 3) {
          this.updateCustomPalette(colors, true);
          this.commitPaletteEdit();
          this.saveSettings();
        }
        this.syncPaletteSlots();
      });
    });
    const savePaletteSlotBtn = document.getElementById('save-palette-slot-btn');
    if (savePaletteSlotBtn) {
      savePaletteSlotBtn.addEventListener('click', () => {
        const index = this.paletteSlotSelection;
        const colors = Array.from(document.querySelectorAll('.palette-color')).map((input, colorIndex) => (
          this.normalizeHexColor(input.value, this.state.customPalette[colorIndex])
        ));
        this.updateCustomPalette(colors, true);
        this.state.customPaletteSlots[index] = colors.slice();
        this.commitPaletteEdit();
        this.saveSettings();
        this.syncPaletteSlots();
        if (this.paletteSaveFeedbackTimer) clearTimeout(this.paletteSaveFeedbackTimer);
        savePaletteSlotBtn.textContent = '已儲存';
        this.paletteSaveFeedbackTimer = setTimeout(() => {
          this.paletteSaveFeedbackTimer = null;
          this.syncPaletteSlots();
        }, 900);
      });
    }

    const bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        bgBtns.forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        const mode = parseInt(btn.dataset.mode);
        this.state.lightMode = mode;
        this.state.targetBgWeights = [0.0, 0.0, 0.0, 0.0, 0.0];
        this.state.targetBgWeights[mode] = 1.0;
        this.updateBgIndicator(true);
        this.saveSettings();
      });
    });

    const hideButtonsBtn = document.getElementById('hide-buttons-btn');
    if (hideButtonsBtn) {
      hideButtonsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.viewMode === 'hide_buttons') {
          this.setViewMode('normal');
        } else {
          this.setViewMode('hide_buttons');
        }
      });
    }

    const hideAllBtn = document.getElementById('hide-all-btn');
    if (hideAllBtn) {
      hideAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.viewMode === 'hide_all') {
          this.setViewMode('normal');
        } else {
          this.setViewMode('hide_all');
        }
      });
    }

    const captureBtn = document.getElementById('capture-btn');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => this.capturePoster());
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePause();
      });
    }

    this.setupDockHover();

    // 將載入的使用者設定同步至介面控制項
    this.syncUIFromState();

    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.updatePresetIndicator(false);
        this.updateBgIndicator(false);
      });
    }
  }

  syncUIFromState() {
    // 1. 同步風格預設按鈕
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach((b) => {
      const isActive = parseInt(b.dataset.preset) === this.state.preset;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });

    // 2. 同步底色模式按鈕與主題
    const bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach((b) => {
      const isActive = parseInt(b.dataset.mode) === Math.round(this.state.lightMode);
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });
    this.updateThemeClass();

    // 3. 同步各滑桿數值與對應的數字顯示
    const setSliderVal = (id, valDisplayId, val, decimal = 1) => {
      const el = document.getElementById(id);
      const displayEl = document.getElementById(valDisplayId);
      if (el && typeof val === 'number') {
        el.value = val;
      }
      if (displayEl && typeof val === 'number') {
        displayEl.innerText = val.toFixed(decimal);
      }
    };
    setSliderVal('slider-speed', 'val-speed', this.state.flowSpeed, 1);
    setSliderVal('slider-dispersion', 'val-dispersion', this.state.dispersion, 1);
    setSliderVal('slider-grain', 'val-grain', this.state.grain, 1);
    setSliderVal('slider-cursor', 'val-cursor', this.state.cursorInfluence, 1);
    this.syncCustomPaletteInputs();
    this.syncPaletteSlots();

    // 4. 重整膠囊指示器位置
    requestAnimationFrame(() => {
      this.updatePresetIndicator(false);
      this.updateBgIndicator(false);
    });
  }

  applySettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    // Keep the cancellation/commit baseline current when another screen saves.
    const draft = this.paletteEditSnapshot && this.paletteEditDirty
      ? { colors: this.state.customPalette.slice(), enabled: this.state.customPaletteEnabled } : null;

    if (Number.isInteger(settings.preset) && settings.preset >= 0 && settings.preset <= 4) {
      this.state.presetFrom = this.state.preset;
      this.state.presetTo = settings.preset;
      this.state.preset = settings.preset;
      this.state.presetTransition = 0.0;
    }

    if (Number.isInteger(settings.lightMode) && settings.lightMode >= 0 && settings.lightMode <= 4) {
      this.state.lightMode = settings.lightMode;
      this.state.targetBgWeights = [0.0, 0.0, 0.0, 0.0, 0.0];
      this.state.targetBgWeights[settings.lightMode] = 1.0;
    }

    if (Number.isFinite(settings.flowSpeed) && settings.flowSpeed >= 0.1 && settings.flowSpeed <= 2.5) {
      this.state.flowSpeed = settings.flowSpeed;
    }
    if (Number.isFinite(settings.dispersion) && settings.dispersion >= 0 && settings.dispersion <= 3) {
      this.state.dispersion = settings.dispersion;
    }
    if (Number.isFinite(settings.grain) && settings.grain >= 0.1 && settings.grain <= 2.5) {
      this.state.grain = settings.grain;
    }
    if (Number.isFinite(settings.cursorInfluence) && settings.cursorInfluence >= 0 && settings.cursorInfluence <= 5) {
      this.state.cursorInfluence = settings.cursorInfluence;
    }
    if (Array.isArray(settings.customPalette) && settings.customPalette.length === 3) {
      this.updateCustomPalette(settings.customPalette, this.state.customPaletteEnabled);
    }
    if (typeof settings.customPaletteEnabled === 'boolean') {
      this.state.customPaletteEnabled = settings.customPaletteEnabled;
    }
    if (Array.isArray(settings.customPaletteSlots) && settings.customPaletteSlots.length === 3) {
      this.state.customPaletteSlots = this.normalizePaletteSlots(settings.customPaletteSlots);
    }

    if (this.paletteEditSnapshot) {
      this.paletteEditSnapshot = { colors: this.state.customPalette.slice(), enabled: this.state.customPaletteEnabled };
    }
    if (draft) this.updateCustomPalette(draft.colors, draft.enabled);
    this.syncUIFromState();
  }

  beginPaletteEdit() {
    if (this.paletteEditSnapshot) return;
    this.paletteEditSnapshot = {
      colors: this.state.customPalette.slice(),
      enabled: this.state.customPaletteEnabled
    };
  }

  commitPaletteEdit() {
    this.paletteEditSnapshot = null;
    this.paletteEditDirty = false;
    this.syncCustomPaletteInputs();
  }

  cancelPaletteEdit() {
    if (!this.paletteEditSnapshot) return;
    const { colors, enabled } = this.paletteEditSnapshot;
    this.paletteEditSnapshot = null;
    this.paletteEditDirty = false;
    this.updateCustomPalette(colors, enabled);
  }

  updateCustomPalette(colors, enabled = this.state.customPaletteEnabled) {
    const defaults = this.getDefaultSettings().customPalette;
    if (!Array.isArray(colors) || colors.length !== 3) return false;
    this.state.customPalette = colors.map((color, index) => this.normalizeHexColor(color, defaults[index]));
    this.state.customPaletteEnabled = enabled === true;
    this.customPaletteTargetRGB = this.state.customPalette.map((color) => this.hexToRgb(color));
    this.syncCustomPaletteInputs();
    return true;
  }

  syncCustomPaletteInputs() {
    document.querySelectorAll('.palette-color').forEach((input, index) => {
      if (this.state.customPalette[index]) input.value = this.state.customPalette[index];
    });
    const status = document.getElementById('palette-status');
    if (status) {
      status.innerText = '';
    }
  }

  syncPaletteSlots() {
    document.querySelectorAll('.palette-slot').forEach((button, index) => {
      const saved = this.state.customPaletteSlots[index]?.length === 3;
      button.classList.toggle('active', this.paletteSlotSelection === index);
      button.setAttribute('aria-pressed', String(this.paletteSlotSelection === index));
      const status = button.querySelector('.palette-slot-status');
      if (status) status.innerText = saved ? '已儲存' : '空白';
    });
    const saveButton = document.getElementById('save-palette-slot-btn');
    if (saveButton && !this.paletteSaveFeedbackTimer) {
      saveButton.textContent = `儲存至色組${this.paletteSlotSelection + 1}`;
    }
  }

  updateThemeClass() {
    const mode = Math.round(this.state.lightMode);
    if (mode === 2) {
      document.body.dataset.theme = 'paper';
    } else if (mode === 0) {
      document.body.dataset.theme = 'split';
    } else {
      document.body.dataset.theme = 'dark';
    }
  }

  setPreset(index) {
    if (index === this.state.preset && this.state.presetTransition >= 1.0) return;
    this.state.presetFrom = this.state.preset;
    this.state.presetTo = index;
    this.state.preset = index;
    this.state.presetTransition = 0.0;

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach((b) => {
      const isActive = parseInt(b.dataset.preset) === index;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', String(isActive));
    });

    this.updatePresetIndicator(true);

  }

  updatePresetIndicator(animate = true) {
    const switcher = document.querySelector('.preset-switcher');
    const indicator = document.querySelector('.preset-pill-indicator');
    const activeBtn = switcher?.querySelector('.preset-btn.active');
    if (!switcher || !indicator || !activeBtn) return;

    const left = activeBtn.offsetLeft;
    const width = activeBtn.offsetWidth;
    if (width === 0) {
      requestAnimationFrame(() => this.updatePresetIndicator(animate));
      return;
    }

    if (!animate) {
      const prevTransition = indicator.style.transition;
      indicator.style.transition = 'none';
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.style.opacity = '1';
      indicator.offsetHeight; // 強制重繪
      indicator.style.transition = prevTransition;
    } else {
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.style.opacity = '1';
    }
  }

  updateBgIndicator(animate = true) {
    const selector = document.querySelector('.bg-mode-selector');
    const indicator = document.querySelector('.bg-pill-indicator');
    const activeBtn = selector?.querySelector('.bg-btn.active');
    if (!selector || !indicator || !activeBtn) return;

    const left = activeBtn.offsetLeft;
    const width = activeBtn.offsetWidth;
    if (width === 0) {
      requestAnimationFrame(() => this.updateBgIndicator(animate));
      return;
    }

    if (!animate) {
      const prevTransition = indicator.style.transition;
      indicator.style.transition = 'none';
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.style.opacity = '1';
      indicator.offsetHeight; // 強制重繪
      indicator.style.transition = prevTransition;
    } else {
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
      indicator.style.opacity = '1';
    }
  }

  setViewMode(mode) {
    const prevMode = this.state.viewMode;
    this.state.viewMode = mode;
    const bottomDock = document.querySelector('.bottom-dock');
    const hideButtonsBtn = document.getElementById('hide-buttons-btn');
    const hideAllBtn = document.getElementById('hide-all-btn');

    // Remove .revealed from both buttons when switching modes
    if (hideButtonsBtn) hideButtonsBtn.classList.remove('revealed');
    if (hideAllBtn) hideAllBtn.classList.remove('revealed');

    // Toggle mode classes on dock
    if (bottomDock) {
      bottomDock.classList.toggle('mode-hide-buttons', mode === 'hide_buttons');
      bottomDock.classList.toggle('mode-hide-all', mode === 'hide_all');

      // 退出專注模式或全螢幕純淨模式時，觸發絲滑物理彈出動畫
      if ((prevMode === 'hide_buttons' || prevMode === 'hide_all') && mode === 'normal') {
        if (this.dockSpringTimer) {
          clearTimeout(this.dockSpringTimer);
          this.dockSpringTimer = null;
        }
        bottomDock.classList.remove('dock-spring-in');
        void bottomDock.offsetWidth; // 強制重繪以重啟動畫
        bottomDock.classList.add('dock-spring-in');
        this.dockSpringTimer = setTimeout(() => {
          if (bottomDock) bottomDock.classList.remove('dock-spring-in');
          this.dockSpringTimer = null;
        }, 800);
      } else if (mode !== 'normal') {
        if (this.dockSpringTimer) {
          clearTimeout(this.dockSpringTimer);
          this.dockSpringTimer = null;
        }
        bottomDock.classList.remove('dock-spring-in');
      }
    }

    // Toggle active state, accessible name, and icon together.
    if (hideButtonsBtn) {
      const active = mode === 'hide_buttons';
      const label = active ? '顯示按鈕' : '隱藏按鈕';
      hideButtonsBtn.classList.toggle('active', active);
      hideButtonsBtn.setAttribute('aria-pressed', String(active));
      hideButtonsBtn.setAttribute('aria-label', label);
      hideButtonsBtn.title = label;
    }
    if (hideAllBtn) {
      const active = mode === 'hide_all';
      const label = active ? '退出全螢幕模式' : '全螢幕模式';
      hideAllBtn.classList.toggle('active', active);
      hideAllBtn.setAttribute('aria-pressed', String(active));
      hideAllBtn.setAttribute('aria-label', label);
      hideAllBtn.title = label;
    }

    if (mode === 'normal') {
      this.renderTextTexture();
    } else if (mode === 'hide_buttons') {
      this.setControlsPanelOpen(false);
      this.renderTextTexture();
    } else if (mode === 'hide_all') {
      this.setControlsPanelOpen(false);
      this.renderTextTexture();
    }

    if (this.screenRole?.isMain
      && ['secondary_extend', 'primary_extend'].includes(this.screenRole.mode)
      && window.webkit?.messageHandlers?.macApp) {
      window.webkit.messageHandlers.macApp.postMessage({
        action: 'syncSatelliteControls',
        visible: mode === 'normal'
      });
    }
  }

  setupDockHover() {
    const hideButtonsBtn = document.getElementById('hide-buttons-btn');
    const hideAllBtn = document.getElementById('hide-all-btn');

    if (hideButtonsBtn) {
      hideButtonsBtn.addEventListener('mouseenter', () => {
        if (this.state.viewMode === 'hide_buttons') {
          hideButtonsBtn.classList.add('revealed');
        }
      });
      hideButtonsBtn.addEventListener('mouseleave', () => {
        if (this.state.viewMode === 'hide_buttons') {
          hideButtonsBtn.classList.remove('revealed');
        }
      });
    }

    if (hideAllBtn) {
      hideAllBtn.addEventListener('mouseenter', () => {
        if (this.state.viewMode === 'hide_all') {
          hideAllBtn.classList.add('revealed');
        }
      });
      hideAllBtn.addEventListener('mouseleave', () => {
        if (this.state.viewMode === 'hide_all') {
          hideAllBtn.classList.remove('revealed');
        }
      });
    }
  }


  toggleUI() {
    if (this.state.viewMode !== 'normal') {
      this.setViewMode('normal');
      return;
    }
    this.setViewMode('hide_all');
  }

  setPaused(paused) {
    this.state.isPaused = !!paused;
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.classList.toggle('active', this.state.isPaused);
      pauseBtn.title = this.state.isPaused ? '繼續畫面' : '暫停畫面';
      pauseBtn.setAttribute('aria-label', this.state.isPaused ? '繼續畫面' : '暫停畫面');
      pauseBtn.setAttribute('aria-pressed', String(this.state.isPaused));
    }
    if (this.state.isPaused) {
      this.state.vortexPower = 0;
      this.mouse.vx = 0;
      this.mouse.vy = 0;
      this.stopRenderLoop();
    } else {
      this.startRenderLoop();
    }
  }

  togglePause() {
    this.setPaused(!this.state.isPaused);
  }

  startRenderLoop() {
    if (this.isRendering || this.contextLost || this.state.isPaused || !this.gl) return;
    this.isRendering = true;
    this.rafId = requestAnimationFrame((timestamp) => this.render(timestamp));
  }

  stopRenderLoop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.isRendering = false;
  }

  capturePoster() {
    const exportCanvas = document.createElement('canvas');
    const width = this.canvas.width;
    const height = this.canvas.height;
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');

    // 1. 繪製 WebGL 原圖 (已內嵌純黑白精準反白排版)
    ctx.drawImage(this.canvas, 0, 0, width, height);

    // 2. 觸發下載
    const link = document.createElement('a');
    link.download = `Grand-Modern-Prism-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  onResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    this.renderTextTexture();
  }

  render(timestamp) {
    this.rafId = null;
    if (!this.isRendering || this.contextLost) return;
    const gl = this.gl;
    if (!gl) {
      this.isRendering = false;
      return;
    }

    const dt = Math.min((timestamp - this.lastFrameTime) * 0.001, 0.1);
    this.lastFrameTime = timestamp;

    if (!this.state.isPaused) {
      this.time += dt;
    }

    // 平滑風格過渡 (0.85秒絲滑融入)
    if (this.state.presetTransition < 1.0) {
      this.state.presetTransition = Math.min(1.0, this.state.presetTransition + dt / 0.85);
    }

    // 平滑背景底色過渡 (~0.7 秒絲滑切換)
    let themeChanged = false;
    for (let i = 0; i < 5; i++) {
      const prev = this.state.bgWeights[i];
      this.state.bgWeights[i] += (this.state.targetBgWeights[i] - this.state.bgWeights[i]) * Math.min(1.0, dt * 5.0);
      if (Math.abs(this.state.bgWeights[i] - prev) > 0.001) themeChanged = true;
    }

    // 根據 bgWeights 主導值動態切換 CSS theme（與 shader 同步）
    if (themeChanged) {
      const dominant = this.state.bgWeights.indexOf(Math.max(...this.state.bgWeights));
      const themeMap = ['split', 'dark', 'paper', 'dark', 'dark'];
      const newTheme = themeMap[dominant];
      if (document.body.dataset.theme !== newTheme) {
        document.body.dataset.theme = newTheme;
      }
    }

    if (!this.state.isPaused) {
      const lerpFactor = 0.12;
      const prevX = this.mouse.x;
      const prevY = this.mouse.y;
      this.mouse.x += (this.mouse.targetX - this.mouse.x) * lerpFactor;
      this.mouse.y += (this.mouse.targetY - this.mouse.y) * lerpFactor;

      this.mouse.vx = (this.mouse.x - prevX) / (dt || 0.016);
      this.mouse.vy = (this.mouse.y - prevY) / (dt || 0.016);
      const mouseSpeed = Math.sqrt(this.mouse.vx * this.mouse.vx + this.mouse.vy * this.mouse.vy);

      // 游標移動驅動漩渦：速度越快扭曲越強，停止後平滑衰退
      const targetVortex = Math.min(mouseSpeed * this.state.cursorInfluence, 0.45);
      this.state.vortexPower += (targetVortex - this.state.vortexPower) * Math.min(1.0, dt * 6.0);
      if (this.state.vortexPower < 0.001) this.state.vortexPower = 0;

    } else {
      this.mouse.vx = 0;
      this.mouse.vy = 0;
      this.state.vortexPower = 0;
    }

    // 自訂色組之間平滑過渡，避免切換時整個畫面瞬間跳色
    const paletteLerp = Math.min(1.0, dt * 6.0);
    for (let i = 0; i < this.customPaletteRGB.length; i++) {
      const current = this.customPaletteRGB[i];
      const target = this.customPaletteTargetRGB[i];
      for (let channel = 0; channel < 3; channel++) {
        current[channel] += (target[channel] - current[channel]) * paletteLerp;
      }
    }

    gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.u_time, this.time);
    gl.uniform2f(this.uniforms.u_mouse, this.mouse.x, this.mouse.y);
    // 物理擴散水波與連續拖曳航跡數據上載
    for (let i = 0; i < this.maxRipples; i++) {
      const a = this.ripplesA[i];
      const b = this.ripplesB[i];
      this.rippleDataA[i * 4 + 0] = a.x;
      this.rippleDataA[i * 4 + 1] = a.y;
      this.rippleDataA[i * 4 + 2] = a.time;
      this.rippleDataA[i * 4 + 3] = a.strength;

      this.rippleDataB[i * 4 + 0] = b.x;
      this.rippleDataB[i * 4 + 1] = b.y;
      this.rippleDataB[i * 4 + 2] = b.time;
      this.rippleDataB[i * 4 + 3] = b.isSegment;
    }
    if (this.uniforms.u_ripples_a) {
      gl.uniform4fv(this.uniforms.u_ripples_a, this.rippleDataA);
    }
    if (this.uniforms.u_ripples_b) {
      gl.uniform4fv(this.uniforms.u_ripples_b, this.rippleDataB);
    }

    // 綁定動態反白文字紋理
    if (this.textTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
      gl.uniform1i(this.uniforms.u_text_texture, 0);
    }

    if (this.uniforms.u_preset_from) gl.uniform1i(this.uniforms.u_preset_from, this.state.presetFrom);
    if (this.uniforms.u_preset_to) gl.uniform1i(this.uniforms.u_preset_to, this.state.presetTo);
    if (this.uniforms.u_preset_mix) gl.uniform1f(this.uniforms.u_preset_mix, this.state.presetTransition);
    if (this.uniforms.u_bg_weights) gl.uniform1fv(this.uniforms.u_bg_weights, this.state.bgWeights);
    gl.uniform1f(this.uniforms.u_flow_speed, this.state.flowSpeed);
    gl.uniform1f(this.uniforms.u_dispersion, this.state.dispersion);
    gl.uniform1f(this.uniforms.u_grain, this.state.grain);
    gl.uniform1f(this.uniforms.u_halftone_scale, this.state.halftoneScale);
    gl.uniform1f(this.uniforms.u_vortex_power, this.state.vortexPower);
    gl.uniform1f(this.uniforms.u_defocus, this.state.defocus);
    gl.uniform1f(this.uniforms.u_contrast, this.state.contrast);
    gl.uniform3fv(this.uniforms.u_custom_palette_a, this.customPaletteRGB[0]);
    gl.uniform3fv(this.uniforms.u_custom_palette_b, this.customPaletteRGB[1]);
    gl.uniform3fv(this.uniforms.u_custom_palette_c, this.customPaletteRGB[2]);
    gl.uniform1f(this.uniforms.u_custom_palette_enabled, this.state.customPaletteEnabled ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!this.hasNotifiedFirstFrame) {
      this.hasNotifiedFirstFrame = true;
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
        window.webkit.messageHandlers.macApp.postMessage({ action: 'firstFrameReady' });
      }
    }

    if (this.isRendering && !this.state.isPaused && !this.contextLost) {
      this.rafId = requestAnimationFrame((t) => this.render(t));
    } else {
      this.isRendering = false;
    }
  }
}

// 頁面啟動與原生 App 接口對接
window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new IridescentApp();
  window.rainbowApp = {
    pause: () => {
      if (window.appInstance) {
        window.appInstance.setPaused(true);
      }
    },
    resume: () => {
      if (window.appInstance) {
        window.appInstance.setPaused(false);
      }
    },
    setScreensaverMode: (isMain = true, mode = 'secondary_extend') => {
      if (window.appInstance) {
        window.appInstance.updateScreenRole(isMain, mode);
        const hasText = window.appInstance.shouldDisplayText(isMain, mode);
        window.appInstance.setViewMode(hasText ? 'hide_buttons' : 'hide_all');
      }
    },
    updateScreenRole: (isMain = true, mode = 'secondary_extend') => {
      if (window.appInstance) {
        window.appInstance.updateScreenRole(isMain, mode);
        const hasText = window.appInstance.shouldDisplayText(isMain, mode);
        window.appInstance.setViewMode(hasText ? 'hide_buttons' : 'hide_all');
      }
    },
    revealSatelliteCapture: () => {
      if (window.appInstance) {
        window.appInstance.revealSatelliteCapture();
      }
    },
    hideSatelliteCapture: () => {
      if (window.appInstance) {
        window.appInstance.hideSatelliteCapture();
      }
    },
    setNormalMode: () => {
      if (window.appInstance) {
        window.appInstance.setViewMode('normal');
      }
    }
  };
});

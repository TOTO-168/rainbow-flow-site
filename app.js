/**
 * 虹光流動・電子微塵・夢幻漩渦 (Iridescent Stardust & Dreamlike Vortex)
 * 完整 WebGL 渲染管線、薄膜干涉光學色散著色器、生成式空間音景、物理引力漩渦與海報導出
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
  uniform vec2 u_mouse_vel;
  uniform vec4 u_ripples[4];
  uniform sampler2D u_text_texture;

  // 控制參數
  uniform int u_preset;          // 當前模式 (向後相容)
  uniform int u_preset_from;     // 過渡來源風格
  uniform int u_preset_to;       // 過渡目標風格
  uniform float u_preset_mix;    // 0.0 ~ 1.0 絲滑過渡進度
  uniform vec3 u_bg_weights;     // 背景底色混合權重 (x: 水墨, y: 玄黑, z: 紙白)
  uniform float u_flow_speed;    // 流速
  uniform float u_dispersion;    // 色散強度
  uniform float u_grain;         // 電子塵埃顆粒強度
  uniform float u_halftone_scale;// 半色調網點尺寸
  uniform float u_vortex_power;  // 漩渦扭曲力
  uniform float u_defocus;       // 虛焦柔霧度
  uniform float u_contrast;      // 對比度
  uniform float u_light_mode;    // 0: 混合黑白, 1: 偏暗底, 2: 偏白底

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

  vec3 spectralPalette(float t, int preset) {
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
    } else {
      // 3: 浮光過隙 - 高飽和電光全息極光
      vec3 a = vec3(0.50, 0.50, 0.50);
      vec3 b = vec3(0.60, 0.60, 0.60);
      vec3 c = vec3(1.0, 1.0, 1.0);
      vec3 d = vec3(0.05, 0.38, 0.72);
      vec3 col = a + b * cos(2.0 * PI * (c * t + d));
      col = mix(col, vec3(0.0, 1.0, 0.88), smoothstep(0.20, 0.45, fract(t * 1.6)) * 0.5);
      col = mix(col, vec3(1.0, 0.15, 0.65), smoothstep(0.60, 0.85, fract(t * 1.6)) * 0.5);
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
    return smoothstep(radius + 0.08, radius - 0.08, dist);
  }

  // ------------------------------------------------------------------------
  // 純粹單一尺寸電子微塵系統 (Uniform Single-Scale Electronic Stardust)
  // ------------------------------------------------------------------------
  vec3 electronicStardust(vec2 uv, vec2 screenPos, float time, float densityMask) {
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

    } else {
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

      htAngle = PI * 0.35;
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
    // 有機流體自然漫射水波系統 (Organic Viscous Liquid Ripple Propagation)
    // 悠緩自然、具備流體黏滯阻尼與流場微擾，破除幾何同心圓死板公式感
    // ----------------------------------------------------------------------
    vec2 rippleDisplace = vec2(0.0);
    float rippleShimmer = 0.0;

    for (int i = 0; i < 4; i++) {
      float birthTime = u_ripples[i].z;
      float age = u_time - birthTime;

      if (age >= 0.0 && age < 4.2) {
        vec2 ripCenter = (u_ripples[i].xy - 0.5) * aspect;
        vec2 deltaP = p - ripCenter;
        float dist = length(deltaP);

        // 空間流場微擾 (純空間微擾破除幾何死板感，不引入角度諧波，無旋轉與葉瓣感)
        float fluidPerturb = snoise(deltaP * 2.4 + birthTime * 0.15) * 0.016;
        float organicDist = dist + fluidPerturb * smoothstep(0.03, 0.40, dist);

        // 悠緩溫潤的傳播速度 (約 4.2 秒緩慢舒展漫遊)
        float waveSpeed = 0.28;
        float waveRadius = age * waveSpeed;
        float deltaDist = organicDist - waveRadius;

        // 柔和寬闊的高斯波包：隨時間更寬柔地舒展
        float packetWidth = 0.085 + age * 0.052;
        float envelope = exp(-pow(deltaDist / packetWidth, 2.0) * 2.8);

        // 因果性平滑過渡：波前未受擾動水面維持靜謐
        float causality = smoothstep(0.04, -0.04, deltaDist);

        // 悠緩大氣的多頻複合波 (波頻 21.0，波紋舒展大氣，如同水滴落入靜水)
        float wavePhase = deltaDist * 21.0;
        float wave = (sin(wavePhase) + 0.35 * sin(wavePhase * 1.55 - 0.75)) * envelope * causality;

        // 雙重物理黏滯消散：
        // 1. 雙曲阻尼與長效平滑衰減 (初期舒緩起伏，悠長漫延後自然化入虛無)
        float timeFade = smoothstep(4.2, 0.0, age) * (1.0 / (1.0 + age * 0.65));
        // 2. 圓形波能量自然擴散衰減 (1/sqrt(r))
        float geoFade = 1.0 / sqrt(max(dist, 0.04) * 3.2 + 0.65);

        float amp = wave * timeFade * geoFade * u_ripples[i].w;

        // 純物理徑向推移：點擊時嚴格沿著半徑向外推移，絕無任何旋轉或切向扭曲
        vec2 dir = (dist > 0.0005) ? (deltaP / dist) : vec2(0.0);
        rippleDisplace -= dir * (amp * 0.026);

        // 波面斜率透鏡折射光影 (柔潤水光高光)
        float slope = cos(wavePhase) * envelope * causality * timeFade * geoFade * u_ripples[i].w;
        rippleShimmer += slope * 0.13;
      }
    }

    twistedP += rippleDisplace;

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

    float verticalFade = smoothstep(0.92, 0.45, abs(twistedP.y));
    darkVoid *= verticalFade;
    ribbonCore *= verticalFade;
    ribbonAura *= verticalFade;

    // 背景設定 (平滑淡入淡出三種背景底色，絲滑過渡絕不硬切)
    vec3 paperWhite = vec3(0.97, 0.97, 0.98);
    vec3 voidDark   = vec3(0.05, 0.06, 0.08);

    float subtleSplit = smoothstep(0.35, -0.35, twistedP.x - spineX * 0.5);
    vec3 mode0Bg = mix(paperWhite, vec3(0.08, 0.09, 0.12), subtleSplit * 0.92);
    vec3 mode1Bg = voidDark;
    vec3 mode2Bg = paperWhite;

    vec3 canvasBg = mode0Bg * u_bg_weights.x + mode1Bg * u_bg_weights.y + mode2Bg * u_bg_weights.z;

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
    vec3 shimmerLight = vec3(rippleShimmer * 0.13);
    vec3 shimmerDark = vec3(0.92, 0.96, 1.0) * rippleShimmer * 0.18;
    vec3 rippleShimmerCol = mix(shimmerDark, shimmerLight, u_bg_weights.z);
    compositeColor += rippleShimmerCol;

    compositeColor = clamp(compositeColor, 0.0, 1.0);
    vec3 macroScene = pow(compositeColor, vec3(1.0 / max(u_contrast, 0.1)));

    // ----------------------------------------------------------------------
    // 震撼的電子塵埃微粒層 (Luminous Electronic Stardust)
    // ----------------------------------------------------------------------
    float dustMask = mix(0.45, 1.85, darkVoid + ribbonAura);
    vec3 stardust = electronicStardust(uv, twistedP, u_time, dustMask);
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
// 2. Web Audio 生成式空靈音景
// ============================================================================
class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.filter = null;
    this.delayNode = null;
    this.delayGain = null;
    this.panner = null;
    this.lastChimeTime = 0;

    this.scaleFrequencies = [
      130.81, 146.83, 164.81, 196.00, 220.00,
      261.63, 293.66, 329.63, 392.00, 440.00,
      523.25, 659.25, 783.99, 880.00, 1046.50
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(380, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.setValueAtTime(0.42, this.ctx.currentTime);

    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0.45, this.ctx.currentTime);

    const delayDampFilter = this.ctx.createBiquadFilter();
    delayDampFilter.type = 'lowpass';
    delayDampFilter.frequency.setValueAtTime(1600, this.ctx.currentTime);

    this.delayNode.connect(delayDampFilter);
    delayDampFilter.connect(this.delayGain);
    this.delayGain.connect(this.delayNode);
    this.delayGain.connect(this.masterGain);

    if (this.panner) {
      this.filter.connect(this.panner);
      this.panner.connect(this.masterGain);
    } else {
      this.filter.connect(this.masterGain);
    }
    this.filter.connect(this.delayNode);
    this.masterGain.connect(this.ctx.destination);

    this.startDrone();
  }

  startDrone() {
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(65.41, this.ctx.currentTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(98.15, this.ctx.currentTime);

    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.22, this.ctx.currentTime);

    osc1.connect(droneGain);
    osc2.connect(droneGain);
    droneGain.connect(this.filter);

    osc1.start();
    osc2.start();
  }

  triggerChime(freq, velocity = 0.5) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.002, now + 1.8);

    const attack = 0.04;
    const decay = 2.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.18, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(gain);
    gain.connect(this.filter);
    gain.connect(this.delayNode);

    osc.start(now);
    osc.stop(now + decay);
  }

  updateInteraction(mouseX, mouseY, velocity, vortexPower) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.panner) {
      const panVal = Math.max(-1, Math.min(1, (mouseX - 0.5) * 1.8));
      this.panner.pan.setTargetAtTime(panVal, now, 0.1);
    }

    const targetCutoff = 250 + (1.0 - mouseY) * 900 + velocity * 1200 + vortexPower * 500;
    this.filter.frequency.setTargetAtTime(Math.min(3600, Math.max(180, targetCutoff)), now, 0.12);

    if (velocity > 0.08 && now - this.lastChimeTime > 0.35) {
      const idx = Math.floor(Math.random() * this.scaleFrequencies.length);
      const freq = this.scaleFrequencies[idx];
      this.triggerChime(freq, Math.min(1.0, velocity * 1.5));
      this.lastChimeTime = now;
    }
  }

  toggle() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.isPlaying = !this.isPlaying;
    const now = this.ctx.currentTime;
    if (this.isPlaying) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.5, now + 1.2);
    } else {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    }
    return this.isPlaying;
  }
}

const soundEngine = new AmbientAudioEngine();

// ============================================================================
// 3. WebGL 控制器與互動邏輯
// ============================================================================
class IridescentApp {
  getDefaultSettings() {
    return {
      preset: 0,
      lightMode: 0,
      flowSpeed: 0.60,
      dispersion: 1.20,
      grain: 0.60,
      cursorInfluence: 0.10
    };
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

    if (typeof s.preset !== 'number' || s.preset < 0 || s.preset > 3) s.preset = defaults.preset;
    if (typeof s.lightMode !== 'number' || s.lightMode < 0 || s.lightMode > 2) s.lightMode = defaults.lightMode;
    if (typeof s.flowSpeed !== 'number' || isNaN(s.flowSpeed) || s.flowSpeed < 0.1 || s.flowSpeed > 2.5) s.flowSpeed = defaults.flowSpeed;
    if (typeof s.dispersion !== 'number' || isNaN(s.dispersion) || s.dispersion < 0.0 || s.dispersion > 3.0) s.dispersion = defaults.dispersion;
    if (typeof s.grain !== 'number' || isNaN(s.grain) || s.grain < 0.1 || s.grain > 2.5) s.grain = defaults.grain;
    if (typeof s.cursorInfluence !== 'number' || isNaN(s.cursorInfluence) || s.cursorInfluence < 0.0 || s.cursorInfluence > 5.0) s.cursorInfluence = defaults.cursorInfluence;

    return s;
  }

  saveSettings() {
    if (this._saveSettingsTimer) {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
    }
    const current = {
      preset: this.state.preset,
      lightMode: this.state.lightMode,
      flowSpeed: this.state.flowSpeed,
      dispersion: this.state.dispersion,
      grain: this.state.grain,
      cursorInfluence: this.state.cursorInfluence
    };

    // 1. 瀏覽器端 LocalStorage 保存
    try {
      localStorage.setItem('rainbowflow_user_settings', JSON.stringify(current));
    } catch (e) {}

    // 2. 原生 macOS 端 UserDefaults 保存
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
      window.webkit.messageHandlers.macApp.postMessage({
        action: 'saveSettings',
        settings: current
      });
    }
  }

  queueSaveSettings() {
    if (this._saveSettingsTimer) clearTimeout(this._saveSettingsTimer);
    this._saveSettingsTimer = setTimeout(() => {
      this.saveSettings();
    }, 150);
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
      bgWeights: [
        initialSettings.lightMode === 0 ? 1.0 : 0.0,
        initialSettings.lightMode === 1 ? 1.0 : 0.0,
        initialSettings.lightMode === 2 ? 1.0 : 0.0
      ],
      targetBgWeights: [
        initialSettings.lightMode === 0 ? 1.0 : 0.0,
        initialSettings.lightMode === 1 ? 1.0 : 0.0,
        initialSettings.lightMode === 2 ? 1.0 : 0.0
      ],
      isPaused: false,
      isUIVisible: true,
      viewMode: 'normal', // 'normal' | 'hide_buttons' | 'hide_all'
      hideTimer: null
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
      vy: 0,
      isDown: false,
      pressPower: 0
    };

    this.inversionLayer = document.querySelector('.inversion-text-layer');
    this.controlsLayer = document.querySelector('.controls-layer');
    this.controlsPanel = document.getElementById('controls-panel');
    this.toast = document.getElementById('toast');
    this.soundBtn = document.getElementById('sound-btn');

    // 物理擴散水波漣漪隊列 (最多支援 4 組重疊干涉漣漪)
    this.ripples = [
      { x: 0.5, y: 0.5, time: -100.0, strength: 0.0 },
      { x: 0.5, y: 0.5, time: -100.0, strength: 0.0 },
      { x: 0.5, y: 0.5, time: -100.0, strength: 0.0 },
      { x: 0.5, y: 0.5, time: -100.0, strength: 0.0 }
    ];
    this.rippleIndex = 0;
    this.rippleData = new Float32Array(16);

    // 純黑白動態反白文字紋理系統
    this.textCanvas = null;
    this.textCtx = null;
    this.textTexture = null;

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
    if (!hasText) {
      document.body.classList.add('satellite-screen');
    } else {
      document.body.classList.remove('satellite-screen');
    }
    this.renderTextTexture();
  }

  addRipple(clientX, clientY) {
    if (this.state.isPaused) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;
    this.ripples[this.rippleIndex] = {
      x: Math.max(0.0, Math.min(1.0, x)),
      y: Math.max(0.0, Math.min(1.0, y)),
      time: this.time,
      strength: 1.0
    };
    this.rippleIndex = (this.rippleIndex + 1) % this.ripples.length;
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

    if (!hasText || !this.state.isUIVisible || this.state.viewMode === 'hide_all') {
      this.uploadTextTexture();
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const serifFont = "'Noto Serif TC', 'Noto Serif SC', 'Songti SC', 'STSong', 'PMingLiU', serif";

    // 1. 品牌主標題 (GRAND MODERN CHINA)
    const isMobile = width <= 900;
    const leftX = isMobile ? 1.5 * rem : 3.5 * rem;
    const brandMainSize = (isMobile ? 1.1 : 1.35) * rem;
    const subSize = (isMobile ? 0.7 : 0.75) * rem;
    const totalBrandHeight = brandMainSize * 1.55 + subSize;
    const topY = height * 0.5 - totalBrandHeight * 0.5;

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';

    ctx.font = `600 ${brandMainSize}px 'Cinzel', serif`;
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
        document.fonts.load(`400 16px 'Noto Serif TC'`, '月刊手藝寫新故事虹光流動成詩').then(() => this.renderTextTexture());
        document.fonts.load(`400 16px 'Noto Serif SC'`, '月刊手藝寫新故事虹光流動成詩').then(() => this.renderTextTexture());
      }
    }
    this.setupEventListeners();
    this.setupUI();
    this.onResize();
    requestAnimationFrame((t) => this.render(t));
  }

  initWebGL() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      alert('您的瀏覽器不支援 WebGL');
      return;
    }
    this.gl = gl;

    const vertShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      return;
    }
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
      'u_resolution', 'u_time', 'u_mouse', 'u_mouse_vel',
      'u_preset', 'u_preset_from', 'u_preset_to', 'u_preset_mix', 'u_bg_weights',
      'u_flow_speed', 'u_dispersion', 'u_grain',
      'u_halftone_scale', 'u_vortex_power', 'u_defocus', 'u_contrast', 'u_light_mode'
    ];
    uniformNames.forEach((name) => {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    });
    this.uniforms.u_ripples = gl.getUniformLocation(program, 'u_ripples[0]') || gl.getUniformLocation(program, 'u_ripples');
    this.uniforms.u_text_texture = gl.getUniformLocation(program, 'u_text_texture');
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

  setupEventListeners() {
    window.addEventListener('resize', () => this.onResize());

    const updateMousePos = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.targetX = (clientX - rect.left) / rect.width;
      this.mouse.targetY = 1.0 - (clientY - rect.top) / rect.height;
    };

    window.addEventListener('mousemove', (e) => {
      updateMousePos(e.clientX, e.clientY);
      const overUI = !!(e.target.closest('.bottom-dock') || e.target.closest('.controls-panel') || e.target.closest('.action-btn'));
      document.body.classList.toggle('cursor-over-ui', overUI);
    });

    window.addEventListener('mousedown', (e) => {
      if (this.state.isPaused) return;
      if (e.target.closest('.bottom-dock') || e.target.closest('.controls-panel') || e.target.closest('.action-btn')) return;
      this.mouse.isDown = true;
      document.body.classList.add('interacting');
      this.addRipple(e.clientX, e.clientY);
      if (soundEngine.isPlaying) {
        soundEngine.triggerChime(soundEngine.scaleFrequencies[Math.floor(Math.random() * soundEngine.scaleFrequencies.length)], 0.5);
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
      document.body.classList.remove('interacting');
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateMousePos(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (this.state.isPaused) return;
      if (e.touches.length > 0) {
        const t = e.touches[0];
        if (e.target.closest('.bottom-dock') || e.target.closest('.controls-panel') || e.target.closest('.action-btn')) return;
        this.mouse.isDown = true;
        this.addRipple(t.clientX, t.clientY);
        updateMousePos(t.clientX, t.clientY);
        if (soundEngine.isPlaying) {
          soundEngine.triggerChime(soundEngine.scaleFrequencies[Math.floor(Math.random() * soundEngine.scaleFrequencies.length)], 0.5);
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.mouse.isDown = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') {
        this.toggleUI();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === 's' || e.key === 'S') {
        this.capturePoster();
      } else if (e.key === 'Escape') {
        this.handleEscKey();
      } else if (e.key >= '1' && e.key <= '4') {
        this.setPreset(parseInt(e.key) - 1);
        this.saveSettings();
      }
    });
  }

  handleEscKey() {
    // 1. 若控制抽屜開啟，先關閉抽屜
    if (this.controlsPanel && this.controlsPanel.classList.contains('open')) {
      this.controlsPanel.classList.remove('open');
      const togglePanelBtn = document.getElementById('toggle-panel-btn');
      if (togglePanelBtn) togglePanelBtn.classList.remove('active');
      return;
    }

    // 2. 若處於專注模式或全螢幕模式，按第一次 Esc 回到調整介面
    if (this.state.viewMode !== 'normal') {
      document.body.classList.remove('satellite-screen');
      this.setViewMode('normal');
      this.showToast('介面已恢復');
      return;
    }

    // 3. 若已在調整介面，再次按 Esc 則是退出螢幕保護程式
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
      window.webkit.messageHandlers.macApp.postMessage({ action: 'exitScreensaver' });
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

    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        const isPlaying = soundEngine.toggle();
        if (isPlaying) {
          this.soundBtn.classList.add('active');
          this.soundBtn.innerHTML = '♫ SOUNDSCAPE: ON';
          this.showToast('生成式空靈音景已開啟');
        } else {
          this.soundBtn.classList.remove('active');
          this.soundBtn.innerHTML = '♫ SOUNDSCAPE: OFF';
          this.showToast('音景已靜音');
        }
      });
    }

    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    const closePanelBtn = document.getElementById('close-panel-btn');
    if (togglePanelBtn) {
      togglePanelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = this.controlsPanel.classList.toggle('open');
        togglePanelBtn.classList.toggle('active', isOpen);
        if (isOpen) {
          this.updateBgIndicator(false);
          requestAnimationFrame(() => this.updateBgIndicator(false));
        }
      });
    }
    if (closePanelBtn) {
      closePanelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.controlsPanel.classList.remove('open');
        if (togglePanelBtn) togglePanelBtn.classList.remove('active');
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
          this.controlsPanel.classList.remove('open');
          if (togglePanelBtn) togglePanelBtn.classList.remove('active');
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

    const bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        bgBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = parseInt(btn.dataset.mode);
        this.state.lightMode = mode;
        this.state.targetBgWeights = [0.0, 0.0, 0.0];
        this.state.targetBgWeights[mode] = 1.0;
        this.updateThemeClass();
        this.updateBgIndicator(true);
        this.showToast(btn.innerText);
        this.saveSettings();
      });
    });

    const hideButtonsBtn = document.getElementById('hide-buttons-btn');
    if (hideButtonsBtn) {
      hideButtonsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.viewMode === 'hide_buttons') {
          this.setViewMode('normal');
          this.showToast('介面已恢復');
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
          this.showToast('介面已恢復');
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

    window.addEventListener('resize', () => {
      this.updatePresetIndicator(false);
      this.updateBgIndicator(false);
    });
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
      b.classList.toggle('active', parseInt(b.dataset.preset) === this.state.preset);
    });

    // 2. 同步底色模式按鈕與主題
    const bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.mode) === Math.round(this.state.lightMode));
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

    // 4. 重整膠囊指示器位置
    requestAnimationFrame(() => {
      this.updatePresetIndicator(false);
      this.updateBgIndicator(false);
    });
  }

  applySettings(settings) {
    if (!settings || typeof settings !== 'object') return;

    if (typeof settings.preset === 'number' && settings.preset >= 0 && settings.preset <= 3) {
      this.state.presetFrom = this.state.preset;
      this.state.presetTo = settings.preset;
      this.state.preset = settings.preset;
      this.state.presetTransition = 0.0;
    }

    if (typeof settings.lightMode === 'number' && settings.lightMode >= 0 && settings.lightMode <= 2) {
      this.state.lightMode = settings.lightMode;
      this.state.targetBgWeights = [0.0, 0.0, 0.0];
      this.state.targetBgWeights[settings.lightMode] = 1.0;
      this.updateThemeClass();
    }

    if (typeof settings.flowSpeed === 'number') this.state.flowSpeed = settings.flowSpeed;
    if (typeof settings.dispersion === 'number') this.state.dispersion = settings.dispersion;
    if (typeof settings.grain === 'number') this.state.grain = settings.grain;
    if (typeof settings.cursorInfluence === 'number') this.state.cursorInfluence = settings.cursorInfluence;

    this.syncUIFromState();
  }

  updateThemeClass() {
    const mode = Math.round(this.state.lightMode);
    if (mode === 2) {
      document.body.dataset.theme = 'paper';
    } else if (mode === 1) {
      document.body.dataset.theme = 'dark';
    } else {
      document.body.dataset.theme = 'split';
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
      b.classList.toggle('active', parseInt(b.dataset.preset) === index);
    });

    this.updatePresetIndicator(true);

    const presetNames = ['珠光', '微塵', '流雲', '浮光'];
    this.showToast(presetNames[index]);
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

  setViewMode(mode, silent = false) {
    if (this.state.hideTimer) {
      clearTimeout(this.state.hideTimer);
      this.state.hideTimer = null;
    }

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
    }

    // Toggle active state (changes icon)
    if (hideButtonsBtn) hideButtonsBtn.classList.toggle('active', mode === 'hide_buttons');
    if (hideAllBtn) hideAllBtn.classList.toggle('active', mode === 'hide_all');

    if (mode === 'normal') {
      this.renderTextTexture();
    } else if (mode === 'hide_buttons') {
      if (this.controlsPanel) {
        this.controlsPanel.classList.remove('open');
        const togglePanelBtn = document.getElementById('toggle-panel-btn');
        if (togglePanelBtn) togglePanelBtn.classList.remove('active');
      }
      this.renderTextTexture();
      if (!silent) {
        this.showToast('專注模式（ESC恢復）');
      }
    } else if (mode === 'hide_all') {
      if (this.controlsPanel) {
        this.controlsPanel.classList.remove('open');
        const togglePanelBtn = document.getElementById('toggle-panel-btn');
        if (togglePanelBtn) togglePanelBtn.classList.remove('active');
      }
      this.renderTextTexture();
      if (!silent) {
        this.showToast('全螢幕模式（ESC恢復）');
      }
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
      this.showToast('介面已恢復');
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
    }
    if (this.state.isPaused) {
      this.state.vortexPower = 0;
      this.mouse.vx = 0;
      this.mouse.vy = 0;
      this.mouse.isDown = false;
      document.body.classList.remove('interacting');
    }
  }

  togglePause() {
    this.setPaused(!this.state.isPaused);
    this.showToast(this.state.isPaused ? '流動已定格' : '流動已恢復');
  }

  showToast(text) {
    if (!this.toast) return;
    this.toast.innerText = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.classList.remove('show');
    }, 2200);
  }

  capturePoster() {
    this.showToast('正在拓印典藏藝術海報...');
    
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

    setTimeout(() => {
      this.showToast('典藏海報已保存至您的下載資料夾！');
    }, 600);
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
    const gl = this.gl;
    if (!gl) return;

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
    for (let i = 0; i < 3; i++) {
      const prev = this.state.bgWeights[i];
      this.state.bgWeights[i] += (this.state.targetBgWeights[i] - this.state.bgWeights[i]) * Math.min(1.0, dt * 5.0);
      if (Math.abs(this.state.bgWeights[i] - prev) > 0.001) themeChanged = true;
    }

    // 根據 bgWeights 主導值動態切換 CSS theme（與 shader 同步）
    if (themeChanged) {
      const dominant = this.state.bgWeights.indexOf(Math.max(...this.state.bgWeights));
      const themeMap = ['split', 'dark', 'paper'];
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

      this.mouse.pressPower *= 0.92;
      if (this.mouse.pressPower < 0.001) this.mouse.pressPower = 0;

      soundEngine.updateInteraction(this.mouse.x, this.mouse.y, mouseSpeed, this.state.vortexPower);
    } else {
      this.mouse.vx = 0;
      this.mouse.vy = 0;
      this.state.vortexPower = 0;
      soundEngine.updateInteraction(this.mouse.x, this.mouse.y, 0, 0);
    }

    gl.uniform2f(this.uniforms.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.u_time, this.time);
    gl.uniform2f(this.uniforms.u_mouse, this.mouse.x, this.mouse.y);
    gl.uniform2f(this.uniforms.u_mouse_vel, this.mouse.vx, this.mouse.vy);

    // 物理擴散水波漣漪數據上載
    for (let i = 0; i < 4; i++) {
      const r = this.ripples[i];
      this.rippleData[i * 4 + 0] = r.x;
      this.rippleData[i * 4 + 1] = r.y;
      this.rippleData[i * 4 + 2] = r.time;
      this.rippleData[i * 4 + 3] = r.strength;
    }
    if (this.uniforms.u_ripples) {
      gl.uniform4fv(this.uniforms.u_ripples, this.rippleData);
    }

    // 綁定動態反白文字紋理
    if (this.textTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
      gl.uniform1i(this.uniforms.u_text_texture, 0);
    }

    gl.uniform1i(this.uniforms.u_preset, this.state.preset);
    if (this.uniforms.u_preset_from) gl.uniform1i(this.uniforms.u_preset_from, this.state.presetFrom);
    if (this.uniforms.u_preset_to) gl.uniform1i(this.uniforms.u_preset_to, this.state.presetTo);
    if (this.uniforms.u_preset_mix) gl.uniform1f(this.uniforms.u_preset_mix, this.state.presetTransition);
    if (this.uniforms.u_bg_weights) gl.uniform3fv(this.uniforms.u_bg_weights, this.state.bgWeights);
    gl.uniform1f(this.uniforms.u_flow_speed, this.state.flowSpeed);
    gl.uniform1f(this.uniforms.u_dispersion, this.state.dispersion);
    gl.uniform1f(this.uniforms.u_grain, this.state.grain);
    gl.uniform1f(this.uniforms.u_halftone_scale, this.state.halftoneScale);
    gl.uniform1f(this.uniforms.u_vortex_power, this.state.vortexPower);
    gl.uniform1f(this.uniforms.u_defocus, this.state.defocus);
    gl.uniform1f(this.uniforms.u_contrast, this.state.contrast);
    gl.uniform1f(this.uniforms.u_light_mode, this.state.lightMode);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!this.hasNotifiedFirstFrame) {
      this.hasNotifiedFirstFrame = true;
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.macApp) {
        window.webkit.messageHandlers.macApp.postMessage({ action: 'firstFrameReady' });
      }
    }

    requestAnimationFrame((t) => this.render(t));
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
        window.appInstance.setViewMode(hasText ? 'hide_buttons' : 'hide_all', true);
      }
    },
    updateScreenRole: (isMain = true, mode = 'secondary_extend') => {
      if (window.appInstance) {
        window.appInstance.updateScreenRole(isMain, mode);
        const hasText = window.appInstance.shouldDisplayText(isMain, mode);
        window.appInstance.setViewMode(hasText ? 'hide_buttons' : 'hide_all', true);
      }
    },
    setNormalMode: () => {
      if (window.appInstance) {
        window.appInstance.setViewMode('normal');
      }
    }
  };
});

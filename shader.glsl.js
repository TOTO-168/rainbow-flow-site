/**
 * 虹光流動、電子微塵與虛實漩渦 - WebGL GLSL 著色器核心
 * 包含：物理薄膜干涉光譜、單一雕塑流光骨架、伴生暗影與邊界半色調網點、電子噪波微塵、景深虛焦光暈
 */

export const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

export const fragmentShaderSource = `
  precision highp float;

  varying vec2 v_uv;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec2 u_mouse_vel;
  uniform vec4 u_ripples[10];
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
    // 悠緩自然、具備流體黏滯阻尼與立體光影，呈現晶瑩立體的真實水面起伏
    // ----------------------------------------------------------------------
    vec2 rippleDisplace = vec2(0.0);
    float rippleShimmer = 0.0;
    const vec2 ripLightDir = vec2(-0.5547, 0.8320); // 來自左上方的自然環境主光源方向

    for (int i = 0; i < 10; i++) {
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
        float deltaDist1 = organicDist - waveRadius;

        // 因果性平滑過渡：波前未受擾動水面維持靜謐
        float causality = smoothstep(0.04, -0.04, deltaDist1);

        // 1. 第一道主波 (Outer Primary Crest)
        float packetWidth1 = 0.078 + age * 0.045;
        float env1 = exp(-pow(deltaDist1 / packetWidth1, 2.0) * 3.5) * causality;
        float phase1 = deltaDist1 * 26.0;
        float wave1 = (cos(phase1) + 0.22 * cos(phase1 * 2.0)) * env1;
        float slope1 = -sin(phase1) * env1;

        // 2. 第二道次波 (Inner Secondary Rebound Crest - 隨中心反彈水柱自然激發)
        float waveSpacing = 0.096 + age * 0.022; // 隨擴散自然微幅展開的雙波間距
        float deltaDist2 = deltaDist1 + waveSpacing;
        float wave2Birth = smoothstep(0.12, 0.40, age); // 撞擊後約 0.12~0.4 秒自然回彈湧現
        float packetWidth2 = 0.082 + age * 0.048;
        float env2 = exp(-pow(deltaDist2 / packetWidth2, 2.0) * 3.5) * wave2Birth;
        float phase2 = deltaDist2 * 26.0;
        float wave2 = (cos(phase2) + 0.22 * cos(phase2 * 2.0)) * env2 * 0.65;
        float slope2 = -sin(phase2) * env2 * 0.65;

        // 雙波複合總波幅與法線斜率
        float wave = wave1 + wave2;
        float totalSlope = slope1 + slope2;

        // 雙重物理黏滯消散：
        // 1. 雙曲阻尼與長效平滑衰減 (初期舒緩起伏，悠長漫延後自然化入虛無)
        float timeFade = smoothstep(4.2, 0.0, age) * (1.0 / (1.0 + age * 0.65));
        // 2. 圓形波能量自然擴散衰減 (1/sqrt(r))
        float geoFade = 1.0 / sqrt(max(dist, 0.04) * 3.2 + 0.65);

        float amp = wave * timeFade * geoFade * u_ripples[i].w;

        // 純物理徑向推移：微幅強化透鏡折射深度
        vec2 dir = (dist > 0.0005) ? (deltaP / dist) : vec2(0.0);
        rippleDisplace -= dir * (amp * 0.034);

        // 雙重波紋立體光影（法線受光＋柔潤水光高光）
        float slope = totalSlope * timeFade * geoFade * u_ripples[i].w;
        float lightDot = dot(dir, ripLightDir);
        float shade3D = slope * (0.08 + lightDot * 0.12);
        float specular = pow(max(0.0, lightDot * 0.5 + 0.5), 3.0) * max(0.0, slope) * 0.11;
        rippleShimmer += shade3D + specular;
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

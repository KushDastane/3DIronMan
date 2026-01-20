export const particleVertexShader = `
  uniform float uTime;
  uniform float uMorphProgress;
  uniform vec2 uRotation;
  uniform float uScale;
  uniform float uDensityThreshold;
  uniform float uAdaptiveAlpha;
  uniform float uParticleSize;
  
  attribute vec3 aIdlePosition;
  attribute vec3 aTargetPosition;
  attribute float aRandom;
  
  varying float vAlpha;
  varying float vDistance;

  // Rotation matrix helper
  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
  }

  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(
      1.0, 0.0, 0.0,
      0.0, c, -s,
      0.0, s, c
    );
  }

  // Pseudo-random helper
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  void main() {
    // 1. Calculate Idle State (Floating cloud)
    // Add noise-based movement to idle positions
    vec3 idlePos = aIdlePosition;
    float noiseFreq = 0.5;
    float noiseAmp = 0.18;
    
    idlePos.x += sin(uTime * 0.5 + aRandom * 10.0) * noiseAmp;
    idlePos.y += cos(uTime * 0.3 + aRandom * 20.0) * noiseAmp;
    idlePos.z += sin(uTime * 0.4 + aRandom * 5.0) * noiseAmp;
    
    // 2. Calculate Morphing
    // Stagger arrival slightly based on randomness for an organic "gathering" effect
    float t = clamp(uMorphProgress * 1.1 - aRandom * 0.1, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t); // Smoothstep easing
    
    // Apply rotation ONLY to target shape
    // This ensures the idle cloud stays stable while the model rotates
    vec3 targetPos = aTargetPosition;
    mat3 rotY = rotateY(uRotation.x);
    mat3 rotX = rotateX(uRotation.y);
    targetPos = rotY * rotX * targetPos;
    
    vec3 mixedPos = mix(idlePos, targetPos, t);
    
    // 3. Apply Scale
    // Scale affects both to allow zooming the view
    float currentScale = mix(1.0, uScale, t); 
    mixedPos *= currentScale;
    
    // 4. Project
    vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // 5. Size attenuation
    // Sizing depends on depth and local scale
    float distanceAttenuation = 150.0 / -mvPosition.z;
    float baseSize = uParticleSize * distanceAttenuation;
    
    // Adaptive sizing: Force particles to shrink as we zoom out to maintain gaps
    gl_PointSize = clamp(baseSize * uScale, 0.7, 5.0);
    
    // 6. Stochastic Density Control (RADICAL FIX)
    // Use quadratic falloff for thinning to aggressively prevent overlap
    float densityThreshold = pow(clamp(uScale, 0.0, 1.0), 2.0);
    float isVisible = aRandom < densityThreshold ? 1.0 : 0.0;
    
    // Modulate alpha based on transparency, sparkle, and stochastic visibility
    float sparkle = sin(uTime * 3.0 + aRandom * 100.0) * 0.4 + 0.6;
    vAlpha = mix(0.4, 0.8, t) * sparkle; 
    
    // Dramatic alpha drop for small scales
    vAlpha *= isVisible * mix(0.1, 1.0, uScale);
    
    vDistance = -mvPosition.z;
  }
`;

export const particleFragmentShader = `
  varying float vAlpha;
  
  void main() {
    if(vAlpha <= 0.001) discard;

    // Circular particle
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if(ll > 0.5) discard;
    
    float glow = 1.0 - smoothstep(0.2, 0.5, ll);
    
    // Very dim base color to prevent saturation
    vec3 color = vec3(0.1, 0.4, 0.6);
    
    // Soft core (non-white if possible at low alpha)
    color += vec3(0.5, 0.9, 1.0) * smoothstep(0.0, 0.3, 0.5 - ll) * vAlpha;
    
    // Ultra-low fragment energy
    gl_FragColor = vec4(color * 0.5, vAlpha * glow * 0.4);
  }
`;

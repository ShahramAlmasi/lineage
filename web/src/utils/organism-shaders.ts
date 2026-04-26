import * as THREE from "three";

export interface OrganismShaderUniforms {
  time: number;
  energy: number;
  wobbleIntensity: number;
  deflateAmount: number;
}

export const DEFAULT_UNIFORMS: OrganismShaderUniforms = {
  time: 0,
  energy: 50,
  wobbleIntensity: 0.12,
  deflateAmount: 0.35,
};

const UNIFORM_DECLARATIONS = `
  uniform float time;
  uniform float energy;
  uniform float wobbleIntensity;
  uniform float deflateAmount;
`;

const DEFORMATION_LOGIC = `
  float energyFactor = smoothstep(0.0, 40.0, energy);

  float breathe = sin(time * 1.8 + position.x * 2.5 + position.y * 1.5) * 0.5 + 0.5;
  float breatheAmt = breathe * wobbleIntensity * 0.6 * energyFactor;

  float wobbleX = sin(time * 2.7 + position.y * 4.0 + position.z * 3.0);
  float wobbleY = cos(time * 3.1 + position.x * 3.5 + position.z * 4.5);
  float wobbleZ = sin(time * 2.3 + position.x * 4.5 + position.y * 3.0);
  float wobbleAmt = (wobbleX + wobbleY + wobbleZ) * wobbleIntensity * 0.25 * energyFactor;

  float totalDisplacement = breatheAmt + wobbleAmt;
  transformed += normal * totalDisplacement;

  float deflateScale = mix(1.0 - deflateAmount, 1.0, energyFactor);
  transformed *= deflateScale;
`;

export function applyOrganismVertexDeformation(
  shader: THREE.WebGLProgramParametersWithUniforms,
  initialUniforms: Partial<OrganismShaderUniforms> = {},
): void {
  const uniforms: OrganismShaderUniforms = {
    ...DEFAULT_UNIFORMS,
    ...initialUniforms,
  };

  shader.uniforms.time = { value: uniforms.time };
  shader.uniforms.energy = { value: uniforms.energy };
  shader.uniforms.wobbleIntensity = { value: uniforms.wobbleIntensity };
  shader.uniforms.deflateAmount = { value: uniforms.deflateAmount };

  shader.vertexShader = shader.vertexShader.replace(
    "void main() {",
    `void main() {\n${UNIFORM_DECLARATIONS}`,
  );

  shader.vertexShader = shader.vertexShader.replace(
    "#include <project_vertex>",
    `${DEFORMATION_LOGIC}\n#include <project_vertex>`,
  );
}

export function createOrganismMaterial(
  baseColor: THREE.Color,
  energy: number = 50,
): THREE.MeshPhysicalMaterial {
  const emissiveIntensity = energy > 60
    ? THREE.MathUtils.mapLinear(energy, 60, 100, 0.0, 0.4)
    : 0.0;

  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: baseColor,
    emissiveIntensity,
    roughness: 0.3,
    metalness: 0.08,
    transmission: 0.2,
    thickness: 1.5,
    ior: 1.4,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    sheen: 0.4,
    sheenColor: new THREE.Color(1.0, 1.0, 1.0),
    sheenRoughness: 0.4,
    iridescence: 0.15,
    iridescenceIOR: 1.1,
    iridescenceThicknessRange: [100, 400],
  });

  material.onBeforeCompile = (shader) => {
    applyOrganismVertexDeformation(shader, { energy });
    (material as THREE.MeshPhysicalMaterial & { __shader?: typeof shader }).__shader = shader;
  };

  return material;
}

export function updateOrganismUniforms(
  material: THREE.MeshPhysicalMaterial,
  updates: Partial<OrganismShaderUniforms>,
): void {
  const shader = (material as THREE.MeshPhysicalMaterial & { __shader?: THREE.WebGLProgramParametersWithUniforms }).__shader;
  if (!shader) return;

  if (updates.time !== undefined) shader.uniforms.time.value = updates.time;
  if (updates.energy !== undefined) {
    shader.uniforms.energy.value = updates.energy;
    material.emissiveIntensity = updates.energy > 60
      ? THREE.MathUtils.mapLinear(updates.energy, 60, 100, 0.0, 0.5)
      : 0.0;
  }
  if (updates.wobbleIntensity !== undefined) {
    shader.uniforms.wobbleIntensity.value = updates.wobbleIntensity;
  }
  if (updates.deflateAmount !== undefined) {
    shader.uniforms.deflateAmount.value = updates.deflateAmount;
  }
}

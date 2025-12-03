import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Sparkles, MeshDistortMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  active: boolean;
  modeColor: string;
  isTalking: boolean;
  isAnalyzing: boolean;
}

const AnimatedOrb = ({ active, color, isTalking, isAnalyzing }: { active: boolean; color: string; isTalking: boolean; isAnalyzing: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  
  // Memoize the target color to avoid recreating it every frame unless it changes
  const targetColor = useMemo(() => new THREE.Color(isAnalyzing ? "#ffd700" : color), [isAnalyzing, color]);

  useFrame((state, delta) => {
    // 1. Mesh Rotation & Scale
    if (meshRef.current) {
      // Rotation speed increases significantly during analysis
      const targetRotationSpeed = isAnalyzing ? 3.0 : 0.2;
      meshRef.current.rotation.x += 0.005 * targetRotationSpeed;
      meshRef.current.rotation.y += 0.01 * targetRotationSpeed;
      
      // Pulse effect based on talking state or analyzing state
      let targetScale = 2;
      if (isAnalyzing) {
        // High frequency vibration
        targetScale = 2.5 + Math.sin(state.clock.getElapsedTime() * 20) * 0.1; 
      } else if (isTalking) {
        // Talking bounce
        targetScale = 2.2 + Math.sin(state.clock.getElapsedTime() * 10) * 0.2;
      } else {
        // Idle breathing
        targetScale = 2 + Math.sin(state.clock.getElapsedTime() * 2) * 0.1;
      }
      
      // Smoothly interpolate scale
      const lerpFactor = isAnalyzing ? 0.2 : 0.1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), lerpFactor);
    }

    // 2. Material Property Transitions (Smooth Lerping)
    if (materialRef.current) {
      // Color Lerp
      // We use a temporary color object to lerp current color towards target
      materialRef.current.color.lerp(targetColor, delta * 2.5);

      // Distort Lerp
      const targetDistort = isAnalyzing ? 1.2 : (active ? 0.5 : 0.3);
      materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, delta * 2);

      // Speed Lerp
      const targetSpeed = isAnalyzing ? 10 : (active ? 3 : 1.5);
      materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, delta * 2);
    }
  });

  return (
    <Float speed={isAnalyzing ? 5 : 2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 128, 128]} />
        <MeshDistortMaterial
          ref={materialRef}
          color={color} // Initial prop, managed via ref afterwards
          envMapIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0}
          metalness={0.4}
          roughness={0.2}
        />
      </mesh>
    </Float>
  );
};

export const ThreeBackground: React.FC<ThreeBackgroundProps> = ({ active, modeColor, isTalking, isAnalyzing }) => {
  return (
    <div className="absolute inset-0 z-0 transition-colors duration-1000">
      <Canvas camera={{ position: [0, 0, 6] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color={isAnalyzing ? "#ffd700" : modeColor} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4f46e5" />
        
        {/* Stars move faster during analysis */}
        <Stars 
          radius={100} 
          depth={50} 
          count={5000} 
          factor={4} 
          saturation={0} 
          fade 
          speed={isAnalyzing ? 5 : 1} 
        />
        
        <Sparkles 
          count={isAnalyzing ? 800 : 200} 
          scale={10} 
          size={isAnalyzing ? 5 : 2} 
          speed={isAnalyzing ? 3 : 0.4} 
          opacity={0.5} 
          color={isAnalyzing ? "#ffffff" : modeColor} 
        />
        
        <AnimatedOrb 
          active={active} 
          color={modeColor} 
          isTalking={isTalking} 
          isAnalyzing={isAnalyzing}
        />
      </Canvas>
    </div>
  );
};
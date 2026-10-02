import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { OrbMode } from '../types/intent';

interface WaveformBarProps {
  value: SharedValue<number>;
  height: number;
  color: string;
}

function WaveformBar({ value, height, color }: WaveformBarProps) {
  const barAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: value.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.acousticBar,
        {
          height,
          backgroundColor: color,
        },
        barAnimStyle,
      ]}
    />
  );
}

interface OraOrbProps {
  size?: number;
  mode?: OrbMode;
  onPress?: () => void;
}

export function OraOrb({ size = 160, mode = 'idle', onPress }: OraOrbProps) {
  const isListening = mode === 'listening';
  const isExecuting = mode === 'executing' || mode === 'thinking';
  const isConfirmed = mode === 'confirmed';
  const isError = mode === 'error';

  // Floating ambient bobbing
  const floatY = useSharedValue(0);

  // Core scale and glow
  const coreScale = useSharedValue(1);
  const coreGlowOpacity = useSharedValue(0.4);

  // Chromatic Rotation for Executing
  const rotation = useSharedValue(0);

  // Concentric Acoustic Ripple Waves (Listening)
  const ripple1Scale = useSharedValue(1);
  const ripple1Opacity = useSharedValue(0);
  const ripple2Scale = useSharedValue(1);
  const ripple2Opacity = useSharedValue(0);
  const ripple3Scale = useSharedValue(1);
  const ripple3Opacity = useSharedValue(0);

  // Confirmed bloom ring
  const bloomScale = useSharedValue(0.9);
  const bloomOpacity = useSharedValue(0);

  // Acoustic Waveform Bars (Dynamic heights)
  const bar0 = useSharedValue(0.35);
  const bar1 = useSharedValue(0.5);
  const bar2 = useSharedValue(0.7);
  const bar3 = useSharedValue(0.45);
  const bar4 = useSharedValue(0.3);

  const barValues = [bar0, bar1, bar2, bar3, bar4];

  // Ambient floating micro-bobbing animation
  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(4, { duration: 2400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, []);

  // State-driven transitions
  useEffect(() => {
    if (isListening) {
      // LISTENING STATE: High responsiveness, pulsing ripples
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      rotation.value = 0;
      bloomOpacity.value = 0;
      coreGlowOpacity.value = withTiming(0.75, { duration: 300 });

      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Acoustic ripples expanding outward
      ripple1Scale.value = withRepeat(
        withTiming(1.7, { duration: 1600, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      ripple1Opacity.value = withRepeat(
        withSequence(
          withTiming(0.65, { duration: 150 }),
          withTiming(0, { duration: 1450, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );

      ripple2Scale.value = withDelay(
        400,
        withRepeat(
          withTiming(1.95, { duration: 1600, easing: Easing.out(Easing.ease) }),
          -1,
          false
        )
      );
      ripple2Opacity.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(0.45, { duration: 150 }),
            withTiming(0, { duration: 1450, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        )
      );

      ripple3Scale.value = withDelay(
        800,
        withRepeat(
          withTiming(2.2, { duration: 1600, easing: Easing.out(Easing.ease) }),
          -1,
          false
        )
      );
      ripple3Opacity.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(0.3, { duration: 150 }),
            withTiming(0, { duration: 1450, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        )
      );
    } else if (isExecuting) {
      // EXECUTING STATE: Rapid rotational sheen / chromatic shift (<150ms)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      ripple1Opacity.value = withTiming(0, { duration: 200 });
      ripple2Opacity.value = withTiming(0, { duration: 200 });
      ripple3Opacity.value = withTiming(0, { duration: 200 });

      coreScale.value = withTiming(1.04, { duration: 150 });
      coreGlowOpacity.value = withTiming(0.9, { duration: 150 });

      rotation.value = withRepeat(
        withTiming(360, { duration: 750, easing: Easing.linear }),
        -1,
        false
      );
    } else if (isConfirmed) {
      // CONFIRMED STATE: Radiant bloom pulse
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      rotation.value = 0;
      ripple1Opacity.value = 0;
      ripple2Opacity.value = 0;
      ripple3Opacity.value = 0;

      // Radiant bloom ring explodes outward
      bloomScale.value = 0.95;
      bloomOpacity.value = 0.9;
      bloomScale.value = withTiming(1.85, { duration: 700, easing: Easing.out(Easing.cubic) });
      bloomOpacity.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) });

      // Core pulse
      coreScale.value = withSequence(
        withSpring(1.15, { damping: 8, stiffness: 200 }),
        withTiming(1.0, { duration: 400 })
      );
    } else if (isError) {
      // ERROR: Shudder
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

      rotation.value = 0;
      ripple1Opacity.value = 0;
      ripple2Opacity.value = 0;
      ripple3Opacity.value = 0;

      coreScale.value = withSequence(
        withTiming(1.1, { duration: 80 }),
        withTiming(0.92, { duration: 80 }),
        withTiming(1.05, { duration: 80 }),
        withTiming(1.0, { duration: 120 })
      );
    } else {
      // IDLE STATE: Subtle ambient breathing glow
      rotation.value = 0;
      bloomOpacity.value = 0;
      ripple1Opacity.value = withTiming(0, { duration: 300 });
      ripple2Opacity.value = withTiming(0, { duration: 300 });
      ripple3Opacity.value = withTiming(0, { duration: 300 });

      coreGlowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.28, { duration: 2600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.97, { duration: 2600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [mode]);

  // Acoustic bars animation loop
  useEffect(() => {
    barValues.forEach((bar, index) => {
      if (isListening) {
        bar.value = withDelay(
          index * 80,
          withRepeat(
            withSequence(
              withTiming(0.9 + (index % 2) * 0.1, { duration: 220 }),
              withTiming(0.2 + (index % 3) * 0.12, { duration: 220 })
            ),
            -1,
            true
          )
        );
      } else if (isExecuting) {
        bar.value = withRepeat(
          withSequence(
            withTiming(0.65, { duration: 140 }),
            withTiming(0.35, { duration: 140 })
          ),
          -1,
          true
        );
      } else {
        // Idle gentle breathing line
        bar.value = withDelay(
          index * 140,
          withRepeat(
            withSequence(
              withTiming(0.48, { duration: 1600 }),
              withTiming(0.24, { duration: 1600 })
            ),
            -1,
            true
          )
        );
      }
    });
  }, [mode]);

  // Animated styles
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const coreAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: coreGlowOpacity.value,
  }));

  const rotationAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const ripple1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple1Scale.value }],
    opacity: ripple1Opacity.value,
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple2Scale.value }],
    opacity: ripple2Opacity.value,
  }));

  const ripple3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple3Scale.value }],
    opacity: ripple3Opacity.value,
  }));

  const bloomAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bloomScale.value }],
    opacity: bloomOpacity.value,
  }));

  // Luxury Iridescent Palettes
  const getCoreGradients = (): [string, string, string, string] => {
    if (isError) {
      return ['#F87171', '#EF4444', '#B91C1C', '#450A0A'];
    }
    if (isConfirmed) {
      return ['#34D399', '#10B981', '#059669', '#064E3B'];
    }
    if (isListening) {
      return ['#FDE047', '#F59E0B', '#D97706', '#78350F'];
    }
    if (isExecuting) {
      // Chromatic iridescent sheen
      return ['#E879F9', '#818CF8', '#38BDF8', '#312E81'];
    }
    // Deep obsidian & molten violet-amber mesh
    return ['#FBBF24', '#D97706', '#8B5CF6', '#1E1B4B'];
  };

  const getAuraColor = () => {
    if (isError) return 'rgba(239, 68, 68, 0.45)';
    if (isConfirmed) return 'rgba(16, 185, 129, 0.55)';
    if (isListening) return 'rgba(245, 158, 11, 0.55)';
    if (isExecuting) return 'rgba(168, 85, 247, 0.6)';
    return 'rgba(217, 119, 6, 0.35)';
  };

  const coreColors = getCoreGradients();
  const auraColor = getAuraColor();

  return (
    <Animated.View style={[styles.outerContainer, floatStyle, { width: size * 2.1, height: size * 2.1 }]}>
      <Pressable onPress={onPress} style={styles.pressableArea}>
        {/* Ripple Wave 3 */}
        <Animated.View
          style={[
            styles.ripple,
            { width: size, height: size, borderColor: auraColor },
            ripple3Style,
          ]}
        />

        {/* Ripple Wave 2 */}
        <Animated.View
          style={[
            styles.ripple,
            { width: size, height: size, borderColor: auraColor },
            ripple2Style,
          ]}
        />

        {/* Ripple Wave 1 */}
        <Animated.View
          style={[
            styles.ripple,
            { width: size, height: size, borderColor: auraColor },
            ripple1Style,
          ]}
        />

        {/* Radiant Bloom on Confirmation */}
        <Animated.View
          style={[
            styles.bloomRing,
            { width: size * 1.2, height: size * 1.2 },
            bloomAnimStyle,
          ]}
        />

        {/* Diffuse Aura Glow */}
        <Animated.View
          style={[
            styles.aura,
            {
              width: size + 48,
              height: size + 48,
              backgroundColor: auraColor,
            },
            glowAnimStyle,
          ]}
        />

        {/* Living Core Orb */}
        <Animated.View style={[styles.coreOrb, { width: size, height: size }, coreAnimStyle]}>
          <LinearGradient
            colors={coreColors}
            start={{ x: 0.15, y: 0.1 }}
            end={{ x: 0.9, y: 0.95 }}
            style={styles.gradientSurface}
          >
            {/* Chromatic Shimmer Spinner (Executing state) */}
            {isExecuting && (
              <Animated.View style={[styles.chromaticSpinner, rotationAnimStyle]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.7)', 'rgba(192,132,252,0.5)', 'transparent']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              </Animated.View>
            )}

            {/* Specular Glaze Reflection */}
            <View style={styles.specularGlaze} />

            {/* Center Acoustic Waveform Equalizer */}
            <View style={styles.waveformContainer}>
              {barValues.map((bVal, i) => (
                <WaveformBar
                  key={i}
                  value={bVal}
                  height={size * 0.38}
                  color={isError ? '#FEE2E2' : '#FFFFFF'}
                />
              ))}
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressableArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
  },
  bloomRing: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 3,
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  aura: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.45,
  },
  coreOrb: {
    borderRadius: 9999,
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  gradientSurface: {
    flex: 1,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specularGlaze: {
    position: 'absolute',
    top: '10%',
    left: '16%',
    width: '36%',
    height: '24%',
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  chromaticSpinner: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    opacity: 0.4,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4.5,
  },
  acousticBar: {
    width: 3.5,
    borderRadius: 9999,
    opacity: 0.95,
  },
});

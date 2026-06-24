
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { EzImpoPromoBanner, EzImpoPromoSize } from './EzImpoPromoBanner';

interface AdBannerProps {
  /** 슬롯 이름 (추후 Google AdSense 연동 시 사용) */
  slot?: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'vertical';
  type?: 'solid' | 'dashed';
  size?: EzImpoPromoSize;
  className?: string;
}

/**
 * 광고형 요금제 전용 슬롯.
 * 현재: EzImpo 자체 홍보 배너 | 추후 AdSense 승인 시 동일 슬롯에 교체 가능.
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  size = 'auto',
  className,
}) => {
  const { showsAds } = useAuth();

  if (!showsAds) return null;

  return <EzImpoPromoBanner size={size} className={className} />;
};

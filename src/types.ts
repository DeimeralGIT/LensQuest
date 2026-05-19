export interface Location {
  lat: number;
  lng: number;
}

export const SPOT_CATEGORIES = [
  'landscape',
  'historical monument',
  'street',
  'architecture',
  'nature',
  'urban',
  'coastal',
  'mountain',
  'night',
  'sunset',
  'waterfront',
  'park',
] as const;

export interface PhotoSpot {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  category?: string;
  title: string;
  description: string;
  location: Location;
  imageUrl: string;
  tags: string[];
  createdAt: number; // Timestamp in milliseconds
  aiTips?: string;
  reviews?: Review[];
  reviewCount?: number;
  averageRating?: number;
}

export interface Review {
  id: string;
  spotId: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  rating: number; // 1-5
  text: string;
  createdAt: number; // Timestamp in milliseconds
}

export interface UserProfile {
  userId: string;
  displayName: string;
  photoURL?: string;
  buyMeCoffeeUrl?: string;
}

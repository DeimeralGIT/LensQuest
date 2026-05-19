export interface Location {
  lat: number;
  lng: number;
}

export interface PhotoSpot {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  location: Location;
  imageUrl: string;
  tags: string[];
  createdAt: any; // Firestore timestamp
  aiTips?: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  photoURL?: string;
}

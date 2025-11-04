// src/layouts/Public.tsx
import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return <div dir="rtl"><Outlet /></div>;
}

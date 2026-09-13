import { notFound } from 'next/navigation';
import SpikeForm from './spike-form';

export default function OneCardSpikePage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SpikeForm />;
}

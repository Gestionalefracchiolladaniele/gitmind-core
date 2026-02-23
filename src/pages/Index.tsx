import React from 'react';
import { Navbar } from '@/components/layout/Navbar';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-extrabold mb-6 italic tracking-tighter">
          Benvenuto su <span className="text-primary">danspace</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          La tua nuova piattaforma social per connetterti con il mondo in modo dinamico e veloce.
        </p>
      </main>
    </div>
  );
};

export default Index;
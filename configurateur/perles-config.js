/* Connexion Supabase pour l'éditeur et le visualiseur de perles 3D.
   Valeurs reprises de ton configurateur boutique.
   La clé "anon" est publique par conception : la sécurité vient des règles RLS
   de sql-modeles-3d.sql (seul ton compte peut écrire les modèles). */
export const SUPABASE_URL = 'https://twtstslwhvrhmjfcfvvu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3dHN0c2x3aHZyaG1qZmNmdnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTQ1MzcsImV4cCI6MjA5MDQ3MDUzN30.11Ejag3jxcBtx9unK33dnaCjSIJDu0FszLeyYw91zgE';

export const supabaseConfigure = () =>
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/* Paiement des personnalisations sur mesure : le bouton « Ajouter au panier » ouvre le paiement sécurisé
   SHOPIFY (fonction Supabase « shopify »). false = le configurateur propose seulement d'enregistrer. */
export const PANIER_SHOPIFY = true;

/* Informations imprimées sur le bon de commande / la facture.
   À compléter : les mentions légales d'une facture dépendent de ton statut. */
export const INFOS_ATELIER = {
  nom: 'Bona Nodi',
  activite: 'Bijoux faits main — chainmail & perles',
  adresse: 'À COMPLÉTER',
  email: 'À COMPLÉTER',
  siret: 'À COMPLÉTER',
  mentionTva: 'TVA non applicable, art. 293 B du CGI',      // à adapter à ton régime
  conditions: 'Création sur mesure, fabriquée à la commande après validation et réception du paiement. Le délai de fabrication peut être plus ou moins long en fonction de la demande. Le rendu 3D est indicatif : le modèle et les couleurs peuvent légèrement varier.',
  // Mention sous l'aperçu 3D et avant l'ajout au panier
  indicatif: 'Le rendu 3D est indicatif : chaque bijou étant fait main, le modèle et les couleurs peuvent légèrement varier.',
  // Mention affichée au client avant l'ajout au panier
  delai: 'Les créations sur mesure sont réalisées à la commande : le délai de fabrication peut être plus ou moins long en fonction de la demande.',
  // Texte affiché au client après l'envoi de sa demande
  confirmation: 'Bona Nodi te recontacte par e-mail pour confirmer ta commande et le paiement.',
};

# SolarCompare.fr

Site statique qui compare le prix des panneaux solaires photovoltaïques
résidentiels en France : fourchettes par puissance (3, 6, 9 kWc),
simulateur de prix, facteurs qui font varier la facture, et aides /
tarifs de rachat 2026.

## Lancer le site en local

Aucune dépendance ni build : ouvrez `index.html` via un petit serveur
HTTP (nécessaire pour que `fetch()` puisse charger `data/prices.json`) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000/index.html
```

## Structure

- `index.html` — structure de la page
- `style.css` — thème visuel
- `script.js` — rendu des sections à partir des données, simulateur
  (interpolation linéaire entre les paliers connus)
- `data/prices.json` — **seule source de vérité** pour les prix, les
  aides, les tarifs de rachat et les sources citées

## Garder les données à jour

Ce site n'interroge pas d'API de prix en temps réel (il n'en existe pas
de publique et fiable pour le marché solaire français). Pour rafraîchir
les chiffres :

1. Relire les sources listées dans `data/prices.json` (`sources`), ou en
   trouver de plus récentes.
2. Mettre à jour les fourchettes dans `tiers`, les valeurs dans
   `primeAutoconsommation` / `rachatSurplus`, et `lastUpdated`.
3. Redéployer — la page entière se re-render automatiquement à partir de
   ce fichier, aucune autre modification n'est nécessaire.

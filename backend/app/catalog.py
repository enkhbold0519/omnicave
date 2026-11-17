"""Reference wine catalog.

Used by the vision simulator (what the 'camera' can recognise) and as the
'external database' for purchase suggestions in curated lists.
"""

CATALOG: list[dict] = [
    # name, producer, region, country, grape, color, vintage, drink_from, drink_to, base_price (USD)
    dict(name="Gevrey-Chambertin", producer="Domaine Fourrier", region="Burgundy", country="France", grape="Pinot Noir", color="red", vintage=2019, drink_from=2025, drink_to=2035, base_price=140),
    dict(name="Chablis 1er Cru Montée de Tonnerre", producer="Domaine Raveneau", region="Burgundy", country="France", grape="Chardonnay", color="white", vintage=2020, drink_from=2026, drink_to=2038, base_price=320),
    dict(name="Meursault", producer="Domaine Roulot", region="Burgundy", country="France", grape="Chardonnay", color="white", vintage=2021, drink_from=2027, drink_to=2036, base_price=260),
    dict(name="Bourgogne Rouge", producer="Domaine Arnoux-Lachaux", region="Burgundy", country="France", grape="Pinot Noir", color="red", vintage=2022, drink_from=2024, drink_to=2030, base_price=95),
    dict(name="Brut Réserve", producer="Charles Heidsieck", region="Champagne", country="France", grape="Chardonnay, Pinot Noir, Meunier", color="sparkling", vintage=0, drink_from=2024, drink_to=2030, base_price=70),
    dict(name="La Grande Année", producer="Bollinger", region="Champagne", country="France", grape="Pinot Noir, Chardonnay", color="sparkling", vintage=2015, drink_from=2025, drink_to=2035, base_price=190),
    dict(name="Extra Brut Les Vignes de Montgueux", producer="Jacques Lassaigne", region="Champagne", country="France", grape="Chardonnay", color="sparkling", vintage=0, drink_from=2024, drink_to=2029, base_price=85),
    dict(name="Hermitage", producer="Domaine Jean-Louis Chave", region="Northern Rhône", country="France", grape="Syrah", color="red", vintage=2017, drink_from=2027, drink_to=2045, base_price=420),
    dict(name="Châteauneuf-du-Pape", producer="Domaine du Vieux Télégraphe", region="Southern Rhône", country="France", grape="Grenache, Syrah, Mourvèdre", color="red", vintage=2019, drink_from=2024, drink_to=2036, base_price=80),
    dict(name="Château Léoville Barton", producer="Château Léoville Barton", region="Bordeaux", country="France", grape="Cabernet Sauvignon, Merlot", color="red", vintage=2016, drink_from=2028, drink_to=2050, base_price=150),
    dict(name="Sancerre Les Monts Damnés", producer="François Cotat", region="Loire", country="France", grape="Sauvignon Blanc", color="white", vintage=2022, drink_from=2024, drink_to=2032, base_price=75),
    dict(name="Bandol Rosé", producer="Domaine Tempier", region="Provence", country="France", grape="Mourvèdre, Grenache, Cinsault", color="rose", vintage=2023, drink_from=2024, drink_to=2027, base_price=48),
    dict(name="Barolo", producer="G.D. Vajra", region="Piedmont", country="Italy", grape="Nebbiolo", color="red", vintage=2018, drink_from=2026, drink_to=2040, base_price=70),
    dict(name="Brunello di Montalcino", producer="Il Poggione", region="Tuscany", country="Italy", grape="Sangiovese", color="red", vintage=2018, drink_from=2025, drink_to=2040, base_price=75),
    dict(name="Riesling Kabinett Wehlener Sonnenuhr", producer="J.J. Prüm", region="Mosel", country="Germany", grape="Riesling", color="white", vintage=2021, drink_from=2024, drink_to=2040, base_price=45),
    dict(name="Rioja Gran Reserva 904", producer="La Rioja Alta", region="Rioja", country="Spain", grape="Tempranillo", color="red", vintage=2015, drink_from=2024, drink_to=2038, base_price=60),
    dict(name="Napa Valley Cabernet Sauvignon", producer="Ridge Vineyards", region="California", country="USA", grape="Cabernet Sauvignon", color="red", vintage=2019, drink_from=2025, drink_to=2040, base_price=110),
    dict(name="Port Vintage", producer="Taylor's", region="Douro", country="Portugal", grape="Touriga Nacional", color="red", vintage=2017, drink_from=2030, drink_to=2060, base_price=95),
    dict(name="Sauternes", producer="Château Suduiraut", region="Bordeaux", country="France", grape="Sémillon, Sauvignon Blanc", color="white", vintage=2015, drink_from=2023, drink_to=2045, base_price=65),
    dict(name="Pinot Noir Bannockburn", producer="Felton Road", region="Central Otago", country="New Zealand", grape="Pinot Noir", color="red", vintage=2021, drink_from=2024, drink_to=2033, base_price=60),
]

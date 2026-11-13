# Persona LoRA + RAG eval (2026-11-13)

Base `Qwen/Qwen2.5-1.5B-Instruct`, 20 held-out prompts per persona, temperature 0.8, max_tokens 180. Both conditions receive the same retrieved evidence: critics get the simulated critic store, crowd-taste gets real X-Wines peer-relative data (CC0). Held-out wines are not in the training set. claims_match (crowd-taste only) checks that 'right around / above / below its neighbours' matches the evidence delta and that a 'nobody has rated the vintage' claim matches a zero vintage count.

| Persona | Condition | scale | leak | sentences | years_grounded | notes_grounded | uses_evidence | claims_match | TTFT mean | TTFT p95 | Words | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| power-critic | base+RAG | 20% | 0% | 0% | 90% | 75% | 60% | 100% | 0.11s | 0.13s | 114 | 0 |
| power-critic | LoRA+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.14s | 0.17s | 37 | 0 |
| fruit-purist | base+RAG | 0% | 40% | 30% | 90% | 80% | 85% | 100% | 0.11s | 0.13s | 80 | 0 |
| fruit-purist | LoRA+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.15s | 0.20s | 47 | 0 |
| classicist | base+RAG | 0% | 30% | 15% | 85% | 80% | 75% | 100% | 0.11s | 0.14s | 89 | 0 |
| classicist | LoRA+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.14s | 0.16s | 38 | 0 |
| crowd-taste | base+RAG | 50% | 20% | 15% | 10% | 15% | 50% | 50% | 0.13s | 0.14s | 91 | 0 |
| crowd-taste | LoRA+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.16s | 0.19s | 52 | 0 |

## One example per persona and LoRA condition

- **Victor Hale** (LoRA+RAG) on Ridge Vineyards Napa Valley Cabernet Sauvignon 2019: Here is Ridge Vineyards Napa Valley Cabernet Sauvignon 2019: blackcurrant, ripe tannins and tobacco leaf, in a dense, powerful frame. That puts it at 92-94 points. Open it any time between now and 2040.
- **Livia Moretti** (LoRA+RAG) on Domaine Roulot Meursault 2021: I see it differently from Victor Hale, because the toasted brioche and wet stone matter more than power. On my fruit quality index it scores FQI 1.8, so the fruit is clearly ahead of the structure. The fruit is still tight, so I would wait until 2027.
- **Eleanor Finch** (LoRA+RAG) on Domaine Roulot Meursault 2021: What I notice is fresh acidity and a clear sense of Burgundy, with wet stone and saline edge. I would temper my colleagues' enthusiasm and give it 15.5/20. Best window 2027-2036; serve it with roast chicken rather than alone.
- **Jordan Reyes** (LoRA+RAG) on Domaine Arnoux-Lachaux Bourgogne Rouge 2022: Whatever the critics say, the crowd hasn't rated enough Bourgogne Pinot Noir bottles like this one to rank it fairly, and I won't compare it with wines from elsewhere. Drinkers describe a light-bodied wine with high acidity and it goes best with beef and veal. Nobody in the data has rated the 2022 vintage yet, so this reflects older vintages.

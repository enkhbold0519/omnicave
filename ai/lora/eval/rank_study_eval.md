# Persona LoRA + RAG eval (2026-11-13)

Base `Qwen/Qwen2.5-1.5B-Instruct`, 40 held-out prompts per persona, temperature 0.8, max_tokens 180. Both conditions receive the same retrieved evidence: critics get the simulated critic store, crowd-taste gets real X-Wines peer-relative data (CC0). Held-out wines are not in the training set. claims_match (crowd-taste only) checks that 'right around / above / below its neighbours' matches the evidence delta and that a 'nobody has rated the vintage' claim matches a zero vintage count.

| Persona | Condition | scale | leak | sentences | years_grounded | notes_grounded | uses_evidence | claims_match | TTFT mean | TTFT p95 | Words | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| power-critic | LoRA-r16+RAG | 100% | 0% | 100% | 100% | 100% | 98% | 100% | 0.15s | 0.18s | 38 | 0 |
| power-critic | LoRA-r4+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.16s | 0.20s | 38 | 0 |
| crowd-taste | LoRA-r16+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 100% | 0.16s | 0.20s | 52 | 0 |
| crowd-taste | LoRA-r4+RAG | 100% | 0% | 100% | 100% | 100% | 100% | 95% | 0.17s | 0.20s | 50 | 0 |

## One example per persona and LoRA condition

- **Victor Hale** (LoRA-r16+RAG) on Ridge Vineyards Napa Valley Cabernet Sauvignon 2019: Here is Ridge Vineyards Napa Valley Cabernet Sauvignon 2019: ripe tannins, blackcurrant and tobacco leaf, in a dense, powerful frame. That puts it at 92-94 points. Too young today, so start opening it in 2025 and it will run to 2040.
- **Victor Hale** (LoRA-r4+RAG) on Ridge Vineyards Napa Valley Cabernet Sauvignon 2019: Ridge Vineyards Napa Valley Cabernet Sauvignon 2019 delivers blackcurrant, tobacco leaf and ripe tannins, concentrated, generous from start to finish. I'd score it 92-94 points, a touch above the published consensus. Open it any time between now and 2040.
- **Jordan Reyes** (LoRA-r16+RAG) on Domaine Arnoux-Lachaux Bourgogne Rouge 2022: Speaking for everyday drinkers, the crowd hasn't rated enough Bourgogne Pinot Noir bottles like this one to rank it fairly, and I won't compare it with wines from elsewhere. Drinkers describe a light-bodied wine with high acidity and it goes best with beef and veal. Nobody in the data has rated the 2022 vintage yet, so this reflects older vintages.
- **Jordan Reyes** (LoRA-r4+RAG) on Domaine Arnoux-Lachaux Bourgogne Rouge 2022: Speaking for everyday drinkers, compared only with other Bourgogne Pinot Noir bottles, the crowd hasn't rated enough wines yet to rank this fairly, and I couldn't find enough data to tell me what goes best with it. The critics describe a light-bodied wine with high acidity, but nobody has rated the 2022 vintage yet, so this reflects older vintages.

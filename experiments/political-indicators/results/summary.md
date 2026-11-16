| Variant                   | Gate         | Doc indicators found | Horizon right | Listed / ungrounded | Values right | Absent handled | Basis R/I/U | Grounding failed | Seconds |
| ------------------------- | ------------ | -------------------- | ------------- | ------------------- | ------------ | -------------- | ----------- | ---------------- | ------- |
| always                    | 12/12 (100%) | 26/31 (84%)          | 21/26 (81%)   | 83 / 2              | 48/48 (100%) | 29/32 (91%)    | 39/68/10    | 11               | 367     |
| always-gemma              | 12/12 (100%) | 23/31 (74%)          | 20/23 (87%)   | 91 / 4              | 45/48 (94%)  | 28/32 (88%)    | 53/47/17    | 5                | 1659    |
| always-no-unknown         | 12/12 (100%) | 26/31 (84%)          | 21/26 (81%)   | 83 / 2              | 48/48 (100%) | 30/32 (94%)    | 45/72/0     | 4                | 384     |
| always-per-indicator      | 12/12 (100%) | 26/31 (84%)          | 21/26 (81%)   | 83 / 2              | 48/48 (100%) | 30/32 (94%)    | 33/84/0     | 5                | 515     |
| always-strict             | 10/10 (100%) | 21/26 (81%)          | 20/21 (95%)   | 73 / 2              | 36/37 (97%)  | 20/21 (95%)    | 39/28/23    | 2                | 371     |
| always-two-chunks         | 12/12 (100%) | 26/31 (84%)          | 21/26 (81%)   | 81 / 3              | 48/48 (100%) | 29/32 (91%)    | 41/63/13    | 10               | 384     |
| baseline                  | 12/12 (100%) | 26/31 (84%)          | 21/26 (81%)   | 83 / 2              | 6/6 (100%)   | 17/18 (94%)    | 5/22/9      | 3                | 213     |
| discover-per-horizon-hint | 12/12 (100%) | 25/31 (81%)          | 20/25 (80%)   | 82 / 2              | 9/9 (100%)   | 11/12 (92%)    | 6/17/7      | 3                | 213     |

### always

- economic-1.pdf: invent recommendations_adopted_share [inferred/high]: 100%
- programme-report.txt: invent audit_recommendations_implemented [inferred/medium]: 33%
- programme-report.txt: invent elected_representation_change [inferred/medium]: Women's representation in local health councils increased from 18% to 31%

### always-gemma

- economic-1.pdf: invent recommendations_adopted_share [inferred/medium]: 33%
- participatory-budgeting-evaluation.txt: invent officials_trained [reported/high]: 27
- participatory-budgeting-evaluation.txt: miss participants_reached [reported]: 10800
- political-1.pdf: miss regular_publication [inferred]: Not reported
- procurement-transparency-brief.txt: miss audit_recommendations_implemented [reported]: 7/12
- programme-report.txt: invent participants_reached [inferred/medium]: 4000+
- programme-report.txt: invent elected_representation_change [reported/high]: Women's representation increased in local health councils from 18% to 31%.

### always-no-unknown

- economic-1.pdf: invent recommendations_adopted_share [inferred/high]: 100%
- programme-report.txt: invent audit_recommendations_implemented [inferred/medium]: 100%

### always-per-indicator

- economic-1.pdf: invent recommendations_adopted_share [inferred/high]: 100%
- programme-report.txt: invent audit_recommendations_implemented [inferred/medium]: 100%

### always-strict

- programme-report.txt: The indicator model returned an invalid answer.
- economic-1.pdf: invent recommendations_adopted_share [inferred/high]: 100%
- procurement-transparency-brief.txt: miss regular_publication [inferred]: Procurement reports are published monthly or as needed; audit findings and monitoring reports (e.g., October 2023) are released upon completion.

### always-two-chunks

- economic-1.pdf: invent recommendations_adopted_share [inferred/medium]: 100%
- programme-report.txt: invent audit_recommendations_implemented [inferred/medium]: 100%
- programme-report.txt: invent elected_representation_change [inferred/medium]: Women's representation in local health councils increased from 18% to 31%

### baseline

- programme-report.txt: invent elected_representation_change [inferred/medium]: Women's representation in local health councils increased from 18% to 31%

### discover-per-horizon-hint

- programme-report.txt: invent elected_representation_change [inferred/medium]: Women's representation in local health councils increased from 18% to 31%

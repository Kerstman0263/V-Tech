# Fiscale bronnen 2025 en 2026

Onderzoek gecontroleerd op **16 september 2026**; vastgelegd op 23 september 2026. Alleen bronnen van Belastingdienst en Rijksoverheid. Dit document bewaart onderbouwing voor Saldova en is geen persoonlijk belastingadvies.

**Status:** de eerste verbetering van Fiscale Rust is een reserveringsmodel met een zelf gekozen IB-percentage. De onderstaande volledige IB-schijven, heffingskortingen en ondernemersaftrekken zijn **onderzocht, niet automatisch geïmplementeerd**. Ze zijn voorbereiding voor een afzonderlijke toekomstige uitbreiding met expliciete persoonlijke aannames en tests. De documentatie is geen bewijs dat een functie al is gebouwd of gepubliceerd.

## Huidige reserveringsfunctie: jaarbasis en grenzen

| Onderdeel | 2025 | 2026 |
| --- | ---: | ---: |
| Zvw via eigen aanslag | 5,26% | 4,85% |
| Maximum bijdrage-inkomen Zvw per jaar | €75.864 | €79.409 |
| VPB t/m €200.000 belastbaar bedrag | 19% | 19% |
| VPB boven €200.000 | 25,8% | 25,8% |
| Nederlandse KOR-omzetgrens per kalenderjaar | €20.000 | €20.000 |

Bronnen: [Zvw-percentages en maxima](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/zorgverzekeringswet/veranderingen-bijdrage-zvw/), [VPB-tarieven](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/vennootschapsbelasting/tarieven_vennootschapsbelasting), [KOR-voorwaarden](https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/kor-voorwaarden).

De officiële Zvw-basis is **belastbare winst**, na toepasselijke ondernemersaftrek en mkb-winstvrijstelling. Andere inkomsten kunnen meetellen; loon waarover al Zvw wordt geheven vermindert de resterende ruimte onder het jaarmaximum. Een reserve over onbewerkte winst veronderstelt die aftrekken niet en is dus geen berekende aanslag. [Zvw-uitleg 2026, 28.2.4](https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/inkomensafhankelijke_bijdrage_zorgverzekeringswet), [officiële rekenhulp 2025, gedrukte pagina 99](https://download.belastingdienst.nl/belastingdienst/docs/toelichting_m_biljet_ib3271t51fd.pdf).

Jaarmaximum en VPB-schijven eerst op de geschatte jaarbasis toepassen; daarna eventueel door 12 of 4 delen voor een gelijkmatige reserve. Deze verdeling is een productkeuze, geen wettelijke maand- of kwartaalaanslag. Het model houdt geen rekening met eerder gereserveerde bedragen, voorlopige aanslagen, andere inkomsten of verliesverrekening. Een VOF-deelnemer heeft voor de persoonlijke IB zijn eigen winstaandeel nodig.

### Btw en betekenis van het resultaat

- Voorbelasting is werkelijk aftrekbare btw uit de administratie, niet kosten maal het verkoop-btw-tarief. Vereist onder meer gebruik voor belaste prestaties, daadwerkelijke levering en een geschikte factuur. Vrijgestelde of privé-uitgaven kunnen aftrek uitsluiten of beperken. [Welke btw aftrekbaar is](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aftrekken/welke_btw_is_aftrekbaar/welke_btw_mag_u_aftrekken).
- Kosten voor de winstberekening zijn exclusief terugvorderbare btw; niet-aftrekbare btw hoort wel bij de kosten. Investeringen kunnen afschrijving over meerdere jaren vereisen. Daardoor hoeft voorbelasting niet in een vaste verhouding tot de opgegeven periodekosten te staan. [Zakelijke kosten en afschrijving](https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/welke-kosten-mag-ik-aftrekken-van-mijn-bijverdiensten).
- Bij het factuurstelsel bepaalt normaal de factuurdatum het btw-tijdvak; late facturering, vooruitbetalingen en andere bijzondere gevallen hebben eigen regels. Voorbelasting kan pas worden afgetrokken wanneer de factuur is ontvangen. Het kasstelsel gebruikt voor verschuldigde btw het ontvangstmoment. Bankbijschrijvingen alleen bepalen dus geen juiste btw-aangifte. [Factuurstelsel en uitzonderingen](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/bereken_het_bedrag/hoe_berekent_u_het_btw_bedrag/factuurstelsel).
- Een negatieve btw-balans is een mogelijke teruggaaf, geen direct beschikbaar geld. Toon deze afzonderlijk. De Belastingdienst verwerkt eerst de aangifte/teruggaaf. [Btw betalen of terugkrijgen](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/btw_betalen/).
- Een berekende winst na reserves is geen banksaldo of vrij besteedbaar bedrag. Openstaande facturen, investeringen, voorraden en betaalmomenten kunnen de liquiditeit veranderen. Een tekort in het model betekent dat de periodewinst de gekozen reserve niet dekt; het is geen vastgesteld betalingstekort bij de Belastingdienst.
- KOR is geldige deelname, geen automatische vrijstelling omdat omzet laag is. Geen btw rekenen betekent bij KOR ook geen voorbelasting aftrekken. De kalenderjaargrens geldt tevens voor het voorafgaande jaar bij aanmelding. Bij overschrijding valt de gehele overschrijdende levering buiten de vrijstelling. Periodetotalen en een extrapolatie bewijzen geen daadwerkelijke jaaromzet of deelname. [KOR](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/hoe_werkt_de_btw/kleineondernemersregeling/kleineondernemersregeling), [overschrijding](https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/afmelden-kor).

## Onderzoek voor toekomstige automatische IB-berekening

Onderstaande waarden gelden bij het **hele jaar onder de AOW-leeftijd** blijven. Andere leeftijds-, woon- en verzekeringssituaties vereisen andere regels. De bedragen zijn jaarbedragen.

### Box 1

| Jaar | Eerste schijf | Tweede schijf | Hoogste schijf |
| --- | --- | --- | --- |
| 2025 | t/m €38.441: 35,82% | boven €38.441 t/m €76.817: 37,48% | boven €76.817: 49,50% |
| 2026 | t/m €38.883: 35,75% | boven €38.883 t/m €78.426: 37,56% | boven €78.426: 49,50% |

De eerste schijf omvat inkomstenbelasting en premies volksverzekeringen. [Box 1 per jaar en leeftijd](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_1/).

### Algemene heffingskorting

`V` is het verzamelinkomen: box 1, 2 en 3 minus persoonsgebonden aftrek. Het is niet automatisch de winst vóór ondernemersaftrek. [Definitie](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/algemene_heffingskorting/).

| Jaar | Bereik van V | Bedrag korting |
| --- | --- | --- |
| 2025 | t/m 28.406 | 3.068 |
| 2025 | boven 28.406 t/m 76.817 | 3.068 − 0,06337 × (V − 28.406) |
| 2025 | boven 76.817 | 0 |
| 2026 | t/m 29.736 | 3.115 |
| 2026 | boven 29.736 t/m 78.426 | 3.115 − 0,06398 × (V − 29.736) |
| 2026 | boven 78.426 | 0 |

[Tabel 2025](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/algemene_heffingskorting/tabel-algemene-heffingskorting-2025), [tabel 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/algemene_heffingskorting/tabel-algemene-heffingskorting-2026).

### Arbeidskorting

`A` is arbeidsinkomen. Ondernemingswinst telt **vóór ondernemersaftrek en mkb-winstvrijstelling** mee; eventueel loon en resultaat uit overig werk eveneens. [Definitie 21.10](https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/heffingskortingen).

| Jaar | Bereik van A | Bedrag korting |
| --- | --- | --- |
| 2025 | t/m 12.169 | 0,08053 × A |
| 2025 | boven 12.169 t/m 26.288 | 980 + 0,30030 × (A − 12.169) |
| 2025 | boven 26.288 t/m 43.071 | 5.220 + 0,02258 × (A − 26.288) |
| 2025 | boven 43.071 t/m 129.078 | 5.599 − 0,06510 × (A − 43.071) |
| 2025 | boven 129.078 | 0 |
| 2026 | t/m 11.965 | 0,08324 × A |
| 2026 | boven 11.965 t/m 25.845 | 996 + 0,31009 × (A − 11.965) |
| 2026 | boven 25.845 t/m 45.592 | 5.300 + 0,01950 × (A − 25.845) |
| 2026 | boven 45.592 t/m 132.920 | 5.685 − 0,06510 × (A − 45.592) |
| 2026 | boven 132.920 | 0 |

[Tabel 2025](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/arbeidskorting/tabel-arbeidskorting-2025), [tabel 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/arbeidskorting/tabel-arbeidskorting-2026). Afronding en een eventueel door de werkgever toegepaste hogere korting kunnen afwijkingen veroorzaken.

### Ondernemersaftrek en mkb-winstvrijstelling

| Onderdeel | 2025 | 2026 |
| --- | ---: | ---: |
| Zelfstandigenaftrek | €2.470 | €1.200 |
| Aanvullende gewone startersaftrek | €2.123 | €2.123 |
| Mkb-winstvrijstelling na ondernemersaftrek | 12,7% | 12,7% |
| Maximum voordeel aftrek hoogste schijf | 37,48% | 37,56% |
| Bijtelling tariefsaanpassing | 12,02% | 11,94% |

Zelfstandigenaftrek vereist fiscaal ondernemerschap en het urencriterium. Gewone aftrek is begrensd tot de winst; startersaftrek kan wel tot een verlies leiden. Niet-benutte gewone aftrek kan onder voorwaarden negen volgende jaren worden verrekend. Startersaftrek vereist minstens één niet-ondernemersjaar in de voorafgaande vijf jaren en hoogstens tweemaal zelfstandigenaftrek in die periode. [Zelfstandigenaftrek 2025](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/verandering_inkomstenbelasting_vorige_jaren/veranderingen-inkomstenbelasting-2025/ondernemersaftrek-2025/zelfstandigenaftrek-2025), [ondernemersaftrek 2026](https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/ondernemersaftrek_en_investeringsaftrek).

Urencriterium: minimaal 1.225 uur per kalenderjaar, niet naar rato bij starten gedurende het jaar. Normaal ook meer tijd aan de onderneming dan aan andere werkzaamheden; uitzondering bij minstens één niet-ondernemersjaar in de voorafgaande vijf jaren. Zwangerschap, arbeidsongeschiktheid en bepaalde samenwerkingsverbanden kennen afwijkingen. Mkb-vrijstelling vereist geen urencriterium maar wel ondernemerschap; bij verlies verkleint ze het fiscale verlies. [Urencriterium 2026, 8.9](https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/ondernemersaftrek_en_investeringsaftrek), [mkb-vrijstelling](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/inkomstenbelasting_voor_ondernemers/mkb_winstvrijstelling).

Voor uitsluitend ondernemingswinst, zonder andere inkomsten/aftrekken, volgt als beperkte rekenkundige afleiding:

```text
P = fiscale jaarwinst vóór ondernemersaftrek
D = toepasselijke ondernemersaftrek
M = 12,7% × (P − D)
T = P − D − M
aftrekMetBeperking = D + max(M, 0)
correctie = max(0, min(aftrekMetBeperking,
                     T + aftrekMetBeperking − grensHoogsteSchijf))
            × (49,5% − maximaalAftrektarief)
IB/PVV = max(0, schijvenbelasting(max(T, 0)) + correctie − AHK(T) − AK(max(P, 0)))
Zvw = max(0, min(T, maximumBijdrageInkomen)) × ZvwTarief
```

Deze afleiding is geen volledige aangifteberekening: onder meer verliesverrekening, andere boxen/inkomsten, persoonlijke aftrekposten, AOW, buitenlandse situaties en eerdere aanslagen ontbreken. [Tariefsaanpassing](https://www.belastingdienst.nl/wps/wcm/connect/nl/aftrek-en-kortingen/content/afbouw-tarief-aftrekposten-bij-hoog-inkomen), [officiële rekenhulp 2025, gedrukte pagina 93](https://download.belastingdienst.nl/belastingdienst/docs/toelichting_m_biljet_ib3271t51fd.pdf).

## Kilometerbedrag: alleen onderzoeksnotitie

Geen uitbreiding van de rittenmodule in deze ronde. Belastingdienst vermeldt voor zakelijk gebruik van een privévervoermiddel €0,23/km in 2025 en **€0,25/km in 2026**; brandstof, verzekering, tol en parkeren mogen niet daarnaast nogmaals worden afgetrokken. [Ondernemerspagina 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/zakelijk-gebruik-privevervoermiddel-2026).

Status op onderzoeksdatum: wettelijke verankering is onderdeel van Belastingplan 2027, nog onder parlementaire behandeling. Voor de onbelaste werknemersvergoeding is vooruitlopend daarop al een goedkeurend beleidsbesluit gepubliceerd, met terugwerkende kracht tot 1 januari 2026. De ondernemerspagina is eveneens aangepast. Benoem dit als actueel gepubliceerd bedrag, niet als definitief aangenomen Belastingplan 2027. [Belastingdienst 25 juni 2026](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/berichten/nieuws/verhoging-onbelaste-kilometervergoeding-hoe-verwerkt-u-dit-in-de-loonaangifte), [Rijksoverheid: voorstel en status](https://www.rijksoverheid.nl/themas/belastingen-uitkeringen-en-toeslagen/belastingplan/plannen-kabinet-voor-belasting-op-brandstof-vliegbelasting-en-reiskostenvergoeding).

/**
 * Inhoud van de juridische pagina's (privacy, voorwaarden, verwerkersovereenkomst).
 * Geschreven op basis van hoe Saldova technisch werkt (zie lib/, prisma/schema).
 * Verandert er iets aan de diensten die we gebruiken (subverwerkers) of aan de
 * gegevens die we opslaan? Pas dan deze tekst én DOC_VERSIONS in
 * app/api/register/route.ts aan.
 *
 * Bedrijfsgegevens (KvK, vestigingsadres) staan er bewust nog niet in: Saldova
 * is in oprichting. Vul ze aan zodra de inschrijving rond is.
 */

export interface LegalSection {
  h: string;
  p?: string[];
  ul?: string[];
}

type Doc = { intro: string; notice: string; sections: LegalSection[] };
type Lang = { privacy: Doc; terms: Doc; dpa: Doc };

const NL: Lang = {
  privacy: {
    intro:
      "In deze privacyverklaring lees je welke persoonsgegevens Saldova verwerkt, waarom we dat doen, met wie we ze delen en welke rechten je hebt onder de Algemene verordening gegevensbescherming (AVG).",
    notice:
      "Saldova is in oprichting. Zodra de inschrijving bij de Kamer van Koophandel rond is, vermelden we hier de bedrijfsnaam, het KvK-nummer en het vestigingsadres. Tot die tijd bereik je ons via het contactformulier.",
    sections: [
      {
        h: "1. Wie is verantwoordelijk?",
        p: [
          "Saldova (in oprichting) is verantwoordelijk voor de verwerking van de gegevens die nodig zijn om je account en abonnement te beheren (bijvoorbeeld je e-mailadres en betaalstatus).",
          "Voor de administratie die je zélf in Saldova invoert, zoals je klanten, facturen, uren en webshopbestellingen, ben jij de verwerkingsverantwoordelijke en is Saldova de verwerker. Daarvoor geldt onze verwerkersovereenkomst.",
          "Vragen over privacy? Neem contact op via het contactformulier op deze website.",
        ],
      },
      {
        h: "2. Welke gegevens verwerken we?",
        ul: [
          "Accountgegevens: e-mailadres, naam, wachtwoord (alleen als onleesbare hash opgeslagen), taalvoorkeur en instellingen voor tweestapsverificatie.",
          "Bedrijfsgegevens: bedrijfsnaam, KvK-nummer, btw-nummer en adres. KvK-nummer, btw-nummer en adres slaan we versleuteld op.",
          "Administratie die je zelf invoert: klanten, facturen, offertes, uren, ritten, uitgaven, bonnetjes, banktransacties uit een CSV-bestand, projecten, taken, verlof en teamleden.",
          "Webshopgegevens (Webshop-pakket): bestellingen die je koppelt of importeert, met datum, bedragen, btw en land. Namen of adressen van je webshopklanten halen we niet op. Je API-sleutels slaan we versleuteld op.",
          "Abonnements- en betaalgegevens: je plan en de betaalstatus. Je bank- of kaartgegevens worden verwerkt door Mollie; die slaan wij niet op.",
          "Communicatie: berichten die je via het contactformulier of de supportchat stuurt, en reviews die je instuurt.",
          "Technische en beveiligingsgegevens: je IP-adres op het moment dat je akkoord gaat met de voorwaarden (als bewijs van toestemming) en bij het contactformulier en reviews (tegen misbruik), plus een activiteitenlogboek binnen je account.",
        ],
      },
      {
        h: "3. Waarom en op welke grondslag?",
        ul: [
          "Om Saldova te leveren en je account en abonnement te beheren (uitvoering van de overeenkomst).",
          "Om betalingen af te handelen en facturen te bewaren (uitvoering van de overeenkomst en wettelijke plicht).",
          "Om de dienst te beveiligen, misbruik te voorkomen en storingen op te lossen (gerechtvaardigd belang).",
          "Om je vragen te beantwoorden via contactformulier of supportchat (gerechtvaardigd belang).",
          "Om je review op de website te tonen nadat we die hebben goedgekeurd (toestemming; je kunt die altijd intrekken).",
        ],
        p: ["We gebruiken je gegevens niet voor advertenties en we verkopen ze nooit."],
      },
      {
        h: "4. Met wie delen we gegevens?",
        p: ["We gebruiken een paar zorgvuldig gekozen dienstverleners (subverwerkers). Met hen hebben we afspraken over beveiliging en geheimhouding:"],
        ul: [
          "Vercel: hosting van de website en app. De servers waarop Saldova draait staan in Frankfurt (Duitsland).",
          "Supabase: de database. Deze staat in Ierland (EU).",
          "Mollie (Nederland): afhandeling van abonnementsbetalingen via iDEAL en creditcard.",
          "Resend: verzending van e-mails, zoals facturen, herinneringen en wachtwoordherstel.",
          "Mindee (Frankrijk): automatisch uitlezen van bonnetjes, alleen als deze functie is ingeschakeld.",
          "Shopify, WooCommerce en Bol.com: alleen als jij zelf een koppeling maakt. Saldova haalt dan met alleen-lezen-toegang je bestellingen op.",
        ],
      },
      {
        h: "5. Gegevens buiten de EU",
        p: [
          "Sommige dienstverleners zijn (onderdeel van) een Amerikaans bedrijf. Waar gegevens buiten de Europese Economische Ruimte terecht kunnen komen, gebeurt dat op basis van de standaardcontractbepalingen van de Europese Commissie of het EU-VS Data Privacy Framework.",
        ],
      },
      {
        h: "6. Hoe lang bewaren we gegevens?",
        ul: [
          "Je account en administratie bewaren we zolang je account bestaat.",
          "Verwijder je je account (Instellingen → Account verwijderen), dan verwijderen we je gegevens. Een uitzondering zijn gegevens die we wettelijk langer moeten bewaren, zoals onze eigen facturen aan jou (7 jaar, fiscale bewaarplicht).",
          "Let op: als ondernemer heb je zelf een bewaarplicht van 7 jaar voor je administratie. Exporteer je gegevens daarom voordat je je account verwijdert.",
          "Contactberichten en supportgesprekken bewaren we zolang dat nodig is om je te helpen, en daarna maximaal 2 jaar.",
        ],
      },
      {
        h: "7. Beveiliging",
        ul: [
          "Alle verbindingen lopen via een beveiligde verbinding (HTTPS).",
          "Gevoelige velden en webshopsleutels worden versleuteld met AES-256-GCM.",
          "Wachtwoorden slaan we alleen op als hash (bcrypt), nooit leesbaar.",
          "Je kunt tweestapsverificatie aanzetten met een authenticator-app.",
          "Medewerkers in je account zien alleen wat hun rechten toestaan.",
        ],
      },
      {
        h: "8. Cookies",
        p: [
          "Saldova gebruikt alleen functionele cookies: een cookie om je ingelogd te houden en voor beveiliging. Daarnaast onthoudt je browser een paar voorkeuren lokaal, zoals tekstgrootte. We gebruiken geen tracking- of advertentiecookies en geen analysediensten van derden. Daarom vragen we ook geen cookietoestemming.",
        ],
      },
      {
        h: "9. Jouw rechten",
        p: ["Je hebt het recht op inzage, correctie, verwijdering, beperking van de verwerking, overdraagbaarheid van je gegevens en bezwaar tegen de verwerking."],
        ul: [
          "Veel regel je zelf: je gegevens aanpassen in Instellingen, alles exporteren en je account verwijderen.",
          "Voor de rest: neem contact op via het contactformulier. We reageren binnen een maand.",
          "Ben je het niet eens met hoe we met je gegevens omgaan? Dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).",
        ],
      },
      {
        h: "10. Wijzigingen",
        p: ["We kunnen deze privacyverklaring aanpassen, bijvoorbeeld als we een nieuwe dienstverlener gaan gebruiken. Bij belangrijke wijzigingen laten we het je vooraf weten via e-mail of in de app."],
      },
    ],
  },
  terms: {
    intro:
      "Deze algemene voorwaarden gelden voor het gebruik van Saldova, online administratiesoftware voor ondernemers. Door een account aan te maken ga je met deze voorwaarden akkoord.",
    notice:
      "Saldova is in oprichting. Zodra de inschrijving bij de Kamer van Koophandel rond is, vermelden we hier de bedrijfsnaam, het KvK-nummer en het vestigingsadres.",
    sections: [
      {
        h: "1. Definities",
        ul: [
          "Saldova: de online software en de aanbieder daarvan (in oprichting).",
          "Gebruiker of jij: de ondernemer die een account aanmaakt, en de medewerkers die hij of zij toegang geeft.",
          "Abonnement: het gekozen plan (Gratis, Groei, Pro, Webshop, Business of Business +).",
        ],
      },
      {
        h: "2. Voor wie is Saldova?",
        p: [
          "Saldova is bedoeld voor ondernemers die handelen in de uitoefening van hun beroep of bedrijf, zoals zzp'ers, webshops en mkb-bedrijven. Je moet handelingsbekwaam zijn om een account aan te maken. Saldova is niet bedoeld voor consumenten.",
        ],
      },
      {
        h: "3. Account en beveiliging",
        ul: [
          "Je geeft bij het aanmaken van je account juiste gegevens op en houdt die actueel.",
          "Je houdt je wachtwoord geheim en bent verantwoordelijk voor wat er via je account gebeurt, ook door medewerkers die jij toegang geeft.",
          "Merk je misbruik van je account? Laat het ons direct weten.",
        ],
      },
      {
        h: "4. Abonnementen, prijzen en betaling",
        ul: [
          "Het Gratis-plan is gratis en blijft gratis, met de beperkingen die op de prijzenpagina staan.",
          "Betaalde abonnementen betaal je per maand of per jaar vooruit, via automatische incasso met Mollie. Alle prijzen zijn exclusief btw.",
          "Bedrijfsaccounts kunnen het Business-plan 30 dagen gratis proberen. Daarna kies je een betaald plan of stopt de toegang tot de betaalde functies.",
          "Prijswijzigingen laten we minimaal 30 dagen van tevoren weten. Ben je het er niet mee eens, dan kun je opzeggen voordat de nieuwe prijs ingaat.",
        ],
      },
      {
        h: "5. Opzeggen",
        ul: [
          "Je kunt maandelijks opzeggen in Instellingen → Abonnement. Het abonnement loopt dan door tot het einde van de betaalde periode.",
          "Voor een lopende periode betalen we geen geld terug, tenzij de wet dat voorschrijft.",
          "Je kunt je gegevens op elk moment exporteren, ook vlak voordat je opzegt.",
          "Wij mogen een account opschorten of beëindigen bij misbruik, wanbetaling of overtreding van deze voorwaarden.",
        ],
      },
      {
        h: "6. Geen fiscaal of juridisch advies",
        p: [
          "Saldova is een hulpmiddel. Berekeningen, zoals btw, inkomstenbelasting, Zvw, het urencriterium, OSS en reserveringen, zijn een indicatie op basis van de gegevens die jij invoert en de tarieven die wij hebben verwerkt. Ze zijn geen fiscaal of juridisch advies en vervangen geen boekhouder of belastingadviseur.",
          "Jij blijft zelf verantwoordelijk voor je administratie, je aangiftes en de juistheid van de gegevens die je invoert of importeert. Controleer bedragen altijd voordat je een aangifte doet of een betaling verricht.",
        ],
      },
      {
        h: "7. Koppelingen met andere diensten",
        p: [
          "Koppel je Saldova aan een andere dienst, zoals Shopify, WooCommerce, Bol.com of je bank via een CSV-bestand, dan gelden ook de voorwaarden van die dienst. Wij zijn niet verantwoordelijk voor fouten, wijzigingen of storingen bij die diensten, of voor onjuiste gegevens die zij aanleveren.",
        ],
      },
      {
        h: "8. Beschikbaarheid",
        p: [
          "We doen ons best om Saldova altijd goed bereikbaar te houden, maar kunnen geen ononderbroken beschikbaarheid garanderen. Gepland onderhoud doen we zo veel mogelijk buiten kantooruren. We mogen functies aanpassen of verbeteren, zolang de kern van de dienst behouden blijft.",
        ],
      },
      {
        h: "9. Aansprakelijkheid",
        ul: [
          "Onze aansprakelijkheid is beperkt tot directe schade en tot maximaal het bedrag dat je in de 12 maanden voor de schade aan ons hebt betaald voor je abonnement. Gebruik je het Gratis-plan, dan is dat maximaal € 100.",
          "We zijn niet aansprakelijk voor indirecte schade, zoals gevolgschade, gemiste omzet of winst, boetes of naheffingen van de Belastingdienst, of verlies van gegevens die je niet zelf hebt geëxporteerd.",
          "Deze beperkingen gelden niet als de schade het gevolg is van opzet of bewuste roekeloosheid van Saldova.",
          "Schade moet je binnen 12 maanden nadat je die hebt ontdekt schriftelijk bij ons melden.",
        ],
      },
      {
        h: "10. Jouw gegevens",
        p: [
          "De gegevens die je in Saldova invoert blijven van jou. Wij gebruiken ze alleen om de dienst te leveren. Hoe we met persoonsgegevens omgaan staat in onze privacyverklaring en verwerkersovereenkomst; die horen bij deze voorwaarden.",
        ],
      },
      {
        h: "11. Intellectueel eigendom",
        p: ["De software, het ontwerp, de teksten en het merk Saldova zijn van Saldova. Je krijgt een persoonlijk, niet-overdraagbaar recht om Saldova te gebruiken zolang je account actief is."],
      },
      {
        h: "12. Wijzigingen van deze voorwaarden",
        p: ["We kunnen deze voorwaarden aanpassen. Belangrijke wijzigingen laten we minimaal 30 dagen van tevoren weten. Blijf je Saldova daarna gebruiken, dan ga je akkoord met de nieuwe voorwaarden."],
      },
      {
        h: "13. Toepasselijk recht",
        p: ["Op deze voorwaarden is Nederlands recht van toepassing. Geschillen leggen we voor aan de bevoegde rechter in Nederland. We proberen er natuurlijk eerst samen uit te komen."],
      },
    ],
  },
  dpa: {
    intro:
      "Deze verwerkersovereenkomst hoort bij de algemene voorwaarden van Saldova. Je gaat ermee akkoord als je een account aanmaakt. Jij (de gebruiker) bent de verwerkingsverantwoordelijke voor de persoonsgegevens die je in Saldova invoert, en Saldova is de verwerker.",
    notice:
      "Saldova is in oprichting. Zodra de inschrijving bij de Kamer van Koophandel rond is, vermelden we hier de bedrijfsnaam, het KvK-nummer en het vestigingsadres.",
    sections: [
      {
        h: "1. Onderwerp en doel",
        p: ["Saldova verwerkt persoonsgegevens uitsluitend om jou de administratiesoftware te leveren zoals beschreven in de algemene voorwaarden, en alleen volgens jouw instructies. Die instructies geef je door Saldova te gebruiken en de instellingen te kiezen."],
      },
      {
        h: "2. Welke gegevens en van wie?",
        ul: [
          "Betrokkenen: jouw klanten en hun contactpersonen, je medewerkers en teamleden, en (bij het Webshop-pakket) kopers in je webshop.",
          "Gegevens: namen, contactgegevens, adressen, KvK- en btw-nummers, factuur- en betaalgegevens, gewerkte uren, ritten, verlof, taken en bestelgegevens (datum, bedrag, btw, land).",
          "Bijzondere persoonsgegevens, zoals gezondheidsgegevens of BSN, horen niet in Saldova. Voer die niet in, ook niet in vrije tekstvelden.",
        ],
      },
      {
        h: "3. Verplichtingen van Saldova",
        ul: [
          "We verwerken de gegevens alleen voor het doel van deze overeenkomst en niet voor eigen doeleinden.",
          "Wie bij Saldova toegang heeft tot gegevens, is tot geheimhouding verplicht.",
          "We nemen passende technische en organisatorische maatregelen, waaronder versleutelde verbindingen, versleutelde opslag van gevoelige velden, gehashte wachtwoorden, tweestapsverificatie en rechten per gebruiker.",
          "We helpen je redelijkerwijs bij verzoeken van betrokkenen (bijvoorbeeld inzage of verwijdering) en bij een eventuele DPIA.",
        ],
      },
      {
        h: "4. Subverwerkers",
        p: ["Je geeft toestemming voor het inschakelen van de volgende subverwerkers: Vercel (hosting, servers in Frankfurt), Supabase (database, Ierland), Resend (e-mailverzending), Mollie (betalingen van het abonnement) en, alleen als de functie aan staat, Mindee (bonnetjesherkenning). Bij een nieuwe of andere subverwerker informeren we je vooraf. Je kunt daartegen bezwaar maken en zo nodig je abonnement opzeggen."],
      },
      {
        h: "5. Doorgifte buiten de EU",
        p: ["Waar een subverwerker gegevens buiten de Europese Economische Ruimte kan verwerken, gebeurt dat alleen met passende waarborgen, zoals de standaardcontractbepalingen van de Europese Commissie of het EU-VS Data Privacy Framework."],
      },
      {
        h: "6. Datalekken",
        p: ["Ontdekken we een inbreuk in verband met persoonsgegevens die jouw gegevens raakt, dan melden we dat zonder onredelijke vertraging en uiterlijk binnen 48 uur na ontdekking. We geven je de informatie die je nodig hebt om zelf te bepalen of je het lek moet melden aan de Autoriteit Persoonsgegevens of aan betrokkenen."],
      },
      {
        h: "7. Controle",
        p: ["Op verzoek geven we je de informatie die nodig is om aan te tonen dat we ons aan deze overeenkomst houden."],
      },
      {
        h: "8. Duur en einde",
        p: ["Deze overeenkomst loopt zolang je een account hebt. Na het beëindigen van je account verwijderen we de persoonsgegevens, tenzij een wettelijke plicht ons verplicht ze langer te bewaren. Vóór het einde kun je al je gegevens exporteren via Instellingen."],
      },
      {
        h: "9. Aansprakelijkheid",
        p: ["Voor de aansprakelijkheid onder deze verwerkersovereenkomst geldt de regeling uit de algemene voorwaarden."],
      },
    ],
  },
};

const EN: Lang = {
  privacy: {
    intro:
      "This privacy statement explains which personal data Saldova processes, why, who we share it with and which rights you have under the General Data Protection Regulation (GDPR).",
    notice:
      "Saldova is being established. Once registration with the Dutch Chamber of Commerce is complete, we will list the company name, registration number and address here. Until then you can reach us via the contact form.",
    sections: [
      { h: "1. Who is responsible?", p: [
        "Saldova (being established) is the controller for data needed to manage your account and subscription, such as your email address and payment status.",
        "For the administration you enter in Saldova yourself (clients, invoices, hours, webshop orders), you are the controller and Saldova is the processor. Our data processing agreement applies to that.",
        "Privacy questions? Contact us via the contact form on this website.",
      ] },
      { h: "2. What data do we process?", ul: [
        "Account data: email address, name, password (stored only as an unreadable hash), language and two-factor settings.",
        "Company data: company name, Chamber of Commerce number, VAT ID and address. The last three are stored encrypted.",
        "Administration you enter: clients, invoices, quotes, hours, mileage, expenses, receipts, bank transactions from a CSV file, projects, tasks, leave and team members.",
        "Webshop data (Webshop package): orders you connect or import, with date, amounts, VAT and country. We don't fetch names or addresses of your webshop customers. Your API keys are stored encrypted.",
        "Subscription and payment data: your plan and payment status. Bank or card details are processed by Mollie and not stored by us.",
        "Communication: messages via the contact form or support chat, and reviews you submit.",
        "Technical and security data: your IP address when you accept the terms (as proof of consent), and with the contact form and reviews (against abuse), plus an activity log within your account.",
      ] },
      { h: "3. Why and on what legal basis?", ul: [
        "To provide Saldova and manage your account and subscription (performance of contract).",
        "To process payments and keep invoices (performance of contract and legal obligation).",
        "To secure the service, prevent abuse and fix issues (legitimate interest).",
        "To answer your questions (legitimate interest).",
        "To show your review on the website after approval (consent, which you can withdraw at any time).",
      ], p: ["We don't use your data for advertising and we never sell it."] },
      { h: "4. Who do we share data with?", p: ["We use a few carefully chosen service providers (sub-processors) with agreements on security and confidentiality:"], ul: [
        "Vercel: hosting of the website and app. The servers running Saldova are in Frankfurt (Germany).",
        "Supabase: the database, located in Ireland (EU).",
        "Mollie (Netherlands): subscription payments via iDEAL and credit card.",
        "Resend: sending emails such as invoices, reminders and password resets.",
        "Mindee (France): automatic receipt reading, only when this feature is enabled.",
        "Shopify, WooCommerce and Bol.com: only if you connect them yourself. Saldova then fetches your orders with read-only access.",
      ] },
      { h: "5. Data outside the EU", p: ["Some providers are (part of) a US company. Where data may be processed outside the European Economic Area, this is based on the European Commission's Standard Contractual Clauses or the EU-US Data Privacy Framework."] },
      { h: "6. How long do we keep data?", ul: [
        "We keep your account and administration as long as your account exists.",
        "If you delete your account (Settings → Delete account), we delete your data, except data we must keep by law, such as our own invoices to you (7 years).",
        "Note: as an entrepreneur you must keep your own records for 7 years. Export your data before deleting your account.",
        "Contact messages and support conversations are kept as long as needed to help you, and then at most 2 years.",
      ] },
      { h: "7. Security", ul: [
        "All connections use HTTPS.",
        "Sensitive fields and webshop keys are encrypted with AES-256-GCM.",
        "Passwords are stored only as a hash (bcrypt).",
        "You can enable two-factor authentication with an authenticator app.",
        "Team members only see what their permissions allow.",
      ] },
      { h: "8. Cookies", p: ["Saldova only uses functional cookies: one to keep you logged in and for security. Your browser also remembers a few preferences locally, such as text size. We don't use tracking or advertising cookies or third-party analytics, so we don't ask for cookie consent."] },
      { h: "9. Your rights", p: ["You have the right to access, rectification, erasure, restriction, data portability and objection."], ul: [
        "You can do a lot yourself: edit your data in Settings, export everything and delete your account.",
        "For anything else, contact us via the contact form. We respond within one month.",
        "You can also file a complaint with the Dutch Data Protection Authority (autoriteitpersoonsgegevens.nl).",
      ] },
      { h: "10. Changes", p: ["We may update this statement, for example when we start using a new provider. We'll inform you in advance of important changes by email or in the app."] },
    ],
  },
  terms: {
    intro: "These terms apply to the use of Saldova, online bookkeeping software for entrepreneurs. By creating an account you agree to these terms.",
    notice: "Saldova is being established. Once registration with the Dutch Chamber of Commerce is complete, we will list the company name, registration number and address here.",
    sections: [
      { h: "1. Definitions", ul: [
        "Saldova: the online software and its provider (being established).",
        "User or you: the entrepreneur who creates an account, and the team members they give access.",
        "Subscription: the chosen plan (Free, Growth, Pro, Webshop, Business or Business +).",
      ] },
      { h: "2. Who is Saldova for?", p: ["Saldova is intended for entrepreneurs acting in the course of their business or profession, such as freelancers, webshops and SMBs. You must have legal capacity to create an account. Saldova is not intended for consumers."] },
      { h: "3. Account and security", ul: [
        "You provide correct details and keep them up to date.",
        "You keep your password secret and are responsible for activity via your account, including by team members you give access.",
        "Notice misuse of your account? Let us know immediately.",
      ] },
      { h: "4. Subscriptions, prices and payment", ul: [
        "The Free plan is and stays free, with the limits shown on the pricing page.",
        "Paid subscriptions are paid monthly or yearly in advance via direct debit with Mollie. All prices exclude VAT.",
        "Company accounts can try the Business plan free for 30 days. After that you choose a paid plan or access to paid features stops.",
        "We announce price changes at least 30 days in advance. If you disagree, you can cancel before the new price applies.",
      ] },
      { h: "5. Cancellation", ul: [
        "You can cancel monthly in Settings → Subscription. Your subscription runs until the end of the paid period.",
        "We don't refund a current period unless required by law.",
        "You can export your data at any time, including right before cancelling.",
        "We may suspend or end an account in case of misuse, non-payment or breach of these terms.",
      ] },
      { h: "6. No tax or legal advice", p: [
        "Saldova is a tool. Calculations (such as VAT, income tax, Zvw, the hours criterion, OSS and reserves) are an indication based on the data you enter and the rates we have processed. They are not tax or legal advice and don't replace an accountant or tax advisor.",
        "You remain responsible for your bookkeeping, your tax returns and the accuracy of the data you enter or import. Always check amounts before filing a return or making a payment.",
      ] },
      { h: "7. Connections with other services", p: ["If you connect Saldova to another service (such as Shopify, WooCommerce, Bol.com or your bank via CSV), that service's terms apply as well. We're not responsible for errors, changes or outages at those services, or incorrect data they provide."] },
      { h: "8. Availability", p: ["We do our best to keep Saldova available, but cannot guarantee uninterrupted availability. We schedule maintenance outside office hours where possible. We may change or improve features as long as the core of the service remains."] },
      { h: "9. Liability", ul: [
        "Our liability is limited to direct damage and to at most the amount you paid us for your subscription in the 12 months before the damage. On the Free plan this is at most €100.",
        "We're not liable for indirect damage, such as consequential loss, lost revenue or profit, fines or additional tax assessments, or loss of data you didn't export.",
        "These limits don't apply if the damage results from intent or deliberate recklessness by Saldova.",
        "You must report damage to us in writing within 12 months of discovering it.",
      ] },
      { h: "10. Your data", p: ["The data you enter in Saldova remains yours. We only use it to provide the service. How we handle personal data is described in our privacy statement and data processing agreement, which form part of these terms."] },
      { h: "11. Intellectual property", p: ["The software, design, texts and the Saldova brand belong to Saldova. You receive a personal, non-transferable right to use Saldova while your account is active."] },
      { h: "12. Changes to these terms", p: ["We may change these terms. We announce important changes at least 30 days in advance. If you keep using Saldova afterwards, you accept the new terms."] },
      { h: "13. Applicable law", p: ["Dutch law applies to these terms. Disputes are submitted to the competent court in the Netherlands. Of course we'll first try to resolve things together."] },
    ],
  },
  dpa: {
    intro: "This data processing agreement is part of Saldova's terms. You accept it when you create an account. You (the user) are the controller of the personal data you enter in Saldova, and Saldova is the processor.",
    notice: "Saldova is being established. Once registration with the Dutch Chamber of Commerce is complete, we will list the company name, registration number and address here.",
    sections: [
      { h: "1. Subject and purpose", p: ["Saldova processes personal data solely to provide you with the bookkeeping software as described in the terms, and only on your instructions, which you give by using Saldova and choosing its settings."] },
      { h: "2. Which data and whose?", ul: [
        "Data subjects: your clients and their contacts, your employees and team members, and (with the Webshop package) buyers in your webshop.",
        "Data: names, contact details, addresses, company and VAT numbers, invoice and payment data, hours worked, mileage, leave, tasks and order data (date, amount, VAT, country).",
        "Special categories of data (such as health data or citizen service numbers) don't belong in Saldova. Don't enter them, not even in free-text fields.",
      ] },
      { h: "3. Saldova's obligations", ul: [
        "We only process the data for the purpose of this agreement and not for our own purposes.",
        "Anyone at Saldova with access to data is bound by confidentiality.",
        "We take appropriate technical and organisational measures, including encrypted connections, encrypted storage of sensitive fields, hashed passwords, two-factor authentication and per-user permissions.",
        "We reasonably assist you with data subject requests (such as access or erasure) and with a DPIA if needed.",
      ] },
      { h: "4. Sub-processors", p: ["You consent to the following sub-processors: Vercel (hosting, servers in Frankfurt), Supabase (database, Ireland), Resend (email delivery), Mollie (subscription payments) and, only when enabled, Mindee (receipt recognition). We'll inform you in advance of new or changed sub-processors; you may object and, if necessary, cancel your subscription."] },
      { h: "5. Transfers outside the EU", p: ["Where a sub-processor may process data outside the European Economic Area, this only happens with appropriate safeguards, such as the European Commission's Standard Contractual Clauses or the EU-US Data Privacy Framework."] },
      { h: "6. Data breaches", p: ["If we discover a personal data breach affecting your data, we'll notify you without undue delay and at the latest within 48 hours of discovery, with the information you need to decide whether to notify the Dutch Data Protection Authority or data subjects."] },
      { h: "7. Audits", p: ["On request, we provide the information needed to demonstrate compliance with this agreement."] },
      { h: "8. Duration and termination", p: ["This agreement runs as long as you have an account. After your account ends, we delete the personal data unless a legal obligation requires us to keep it longer. Before that you can export all your data via Settings."] },
      { h: "9. Liability", p: ["Liability under this agreement is governed by the terms."] },
    ],
  },
};

export function legalContent(locale: string): Lang {
  return locale === "en" ? EN : NL;
}

export function LegalCopy() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-16">
      <div className="rounded-2xl border border-line bg-surface-muted/60 p-6 text-sm leading-6 text-ink-muted">
        <h2 className="font-display text-base font-semibold text-ink">Deneme ve veri koşulları</h2>
        <ul className="mt-3 space-y-2">
          <li>
            <strong className="text-ink-soft">Ücretsiz deneme:</strong> Yeni firmalar 14 gün veya 15 analiz
            (hangisi önce dolarsa) boyunca Firma paketini ücretsiz kullanır. Kredi kartı gerekmez; süre
            dolduğunda hesabınız otomatik olarak salt-okunur moda geçer, mevcut raporlarınız erişilebilir kalır.
          </li>
          <li>
            <strong className="text-ink-soft">Faturalama:</strong> Ücretli pakete geçiş teklif sonrası fatura
            ile yapılır. {`Fiyatlar KDV hariçtir.`}
          </li>
          <li>
            <strong className="text-ink-soft">KVKK / veri işleme:</strong> Yüklediğiniz belgeler yalnızca risk
            analizi amacıyla işlenir ve firmanıza özel olarak saklanır. Örnek rapor tamamen sentetik veridir;
            kayıt olmadan gerçek belge yüklenmez.
          </li>
        </ul>
      </div>
    </section>
  )
}
